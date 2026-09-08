const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');
const { requireAdmin, requireAuth, optionalAuth } = require('../middleware/auth');
const alegra = require('../services/alegra');
const { encrypt, decrypt } = require('../services/crypto');

const router = express.Router();

function decryptQuoteRow(q) {
  return Object.assign({}, q, {
    customer_name: decrypt(q.customer_name),
    customer_phone: decrypt(q.customer_phone),
    customer_email: q.customer_email ? decrypt(q.customer_email) : null
  });
}

const quoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas cotizaciones seguidas. Intenta de nuevo en unos minutos.' }
});

router.post('/', quoteLimiter, optionalAuth, async function (req, res) {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const customerName = String(b.name || '').trim().slice(0, 120);
    const customerPhone = String(b.phone || '').trim().slice(0, 40);
    const customerEmail = b.email ? String(b.email).trim().slice(0, 160) : null;
    const items = Array.isArray(b.items) ? b.items : [];

    if (!customerName || !customerPhone) {
      return res.status(400).json({ ok: false, error: 'Nombre y telefono son obligatorios.' });
    }
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: 'La cotizacion no tiene productos.' });
    }

    // Nunca confiar en el precio que manda el cliente: se recalcula desde la base de datos.
    const ids = items.map(function (it) { return Number(it.product_id); }).filter(Number.isInteger);
    const dbProducts = await client.query('SELECT id, name, price FROM products WHERE id = ANY($1::int[])', [ids]);
    const byId = {};
    dbProducts.rows.forEach(function (p) { byId[p.id] = p; });

    const lineItems = [];
    let subtotal = 0;
    for (const it of items) {
      const product = byId[Number(it.product_id)];
      if (!product) continue;
      const qty = Math.max(1, Math.min(999, parseInt(it.qty, 10) || 1));
      const lineTotal = Number(product.price) * qty;
      subtotal += lineTotal;
      lineItems.push({ product_id: product.id, product_name: product.name, unit_price: product.price, qty });
    }

    if (lineItems.length === 0) {
      return res.status(400).json({ ok: false, error: 'Ninguno de los productos de la cotizacion existe.' });
    }

    await client.query('BEGIN');
    const userId = (req.user && req.user.id) || null;
    const quoteResult = await client.query(
      `INSERT INTO quotes (user_id, customer_name, customer_phone, customer_email, subtotal)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, encrypt(customerName), encrypt(customerPhone), customerEmail ? encrypt(customerEmail) : null, subtotal]
    );
    const quoteId = quoteResult.rows[0].id;

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO quote_items (quote_id, product_id, product_name, unit_price, qty)
         VALUES ($1,$2,$3,$4,$5)`,
        [quoteId, li.product_id, li.product_name, li.unit_price, li.qty]
      );
    }
    await client.query('COMMIT');

    // Sincronizar con Alegra fuera de la transaccion: si falla, la cotizacion local ya quedo guardada.
    let alegraSynced = false;
    try {
      const estimate = await alegra.syncQuoteToAlegra({
        customerName, customerPhone, customerEmail, items: lineItems
      });
      if (estimate && estimate.id) {
        await pool.query(
          'UPDATE quotes SET alegra_estimate_id = $1, alegra_synced = true WHERE id = $2',
          [String(estimate.id), quoteId]
        );
        alegraSynced = true;
      }
    } catch (alegraErr) {
      console.error('Alegra sync error (cotizacion igual quedo guardada):', alegraErr.message);
    }

    res.status(201).json({ ok: true, quote_id: quoteId, subtotal, alegra_synced: alegraSynced });
  } catch (err) {
    await client.query('ROLLBACK').catch(function () {});
    console.error('create quote error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo guardar la cotizacion.' });
  } finally {
    client.release();
  }
});

router.get('/mine', requireAuth, async function (req, res) {
  try {
    const quotes = await pool.query(
      'SELECT * FROM quotes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    const ids = quotes.rows.map(function (q) { return q.id; });
    const items = ids.length
      ? await pool.query('SELECT * FROM quote_items WHERE quote_id = ANY($1::int[])', [ids])
      : { rows: [] };
    const itemsByQuote = {};
    items.rows.forEach(function (it) {
      itemsByQuote[it.quote_id] = itemsByQuote[it.quote_id] || [];
      itemsByQuote[it.quote_id].push(it);
    });
    const result = quotes.rows.map(function (q) { return Object.assign(decryptQuoteRow(q), { items: itemsByQuote[q.id] || [] }); });
    res.json({ ok: true, quotes: result });
  } catch (err) {
    console.error('list my quotes error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo cargar tu historial.' });
  }
});

router.get('/', requireAdmin, async function (req, res) {
  try {
    const quotes = await pool.query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 200');
    const ids = quotes.rows.map(function (q) { return q.id; });
    const items = ids.length
      ? await pool.query('SELECT * FROM quote_items WHERE quote_id = ANY($1::int[])', [ids])
      : { rows: [] };

    const itemsByQuote = {};
    items.rows.forEach(function (it) {
      itemsByQuote[it.quote_id] = itemsByQuote[it.quote_id] || [];
      itemsByQuote[it.quote_id].push(it);
    });

    const result = quotes.rows.map(function (q) {
      return Object.assign(decryptQuoteRow(q), { items: itemsByQuote[q.id] || [] });
    });

    res.json({ ok: true, quotes: result });
  } catch (err) {
    console.error('list quotes error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las cotizaciones.' });
  }
});

router.put('/:id/status', requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    const status = req.body && req.body.status;
    if (!Number.isInteger(id) || !['nueva', 'confirmada', 'cancelada'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Datos invalidos.' });
    }
    await pool.query('UPDATE quotes SET status = $1 WHERE id = $2', [status, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('update quote status error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar la cotizacion.' });
  }
});

module.exports = router;
