const express = require('express');
const pool = require('../../db/pool');
const { requireAdmin } = require('../middleware/auth');
const { decrypt } = require('../services/crypto');
const alegra = require('../services/alegra');

const router = express.Router();

var ACCENTS = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u' };

function slugify(text) {
  var lower = String(text).toLowerCase().split('').map(function (ch) {
    return ACCENTS[ch] || ch;
  }).join('');
  return lower
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// image_url acepta un link https:// normal o una foto subida desde el panel guardada
// como data URI en base64 (por eso el limite es mucho mas alto que el de los demas
// campos de texto) — cualquier otro esquema (http://, javascript:, etc.) se descarta,
// porque este valor se pinta luego en el catalogo publico para todos los visitantes.
function sanitizeImageUrl(value) {
  if (!value) return null;
  const str = String(value).trim().slice(0, 3000000);
  if (!str) return null;
  if (!/^(https:\/\/|data:image\/)/.test(str)) return null;
  return str;
}

router.get('/', async function (req, res) {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, category, unit, price, description, image_url, icon, stock_status, stock_quantity
       FROM products WHERE active = true ORDER BY category, name`
    );
    res.json({ ok: true, products: result.rows });
  } catch (err) {
    console.error('list products error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el catalogo.' });
  }
});

router.post('/', requireAdmin, async function (req, res) {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 200);
    const category = String(b.category || '').trim().slice(0, 60);
    const unit = String(b.unit || 'unidad').trim().slice(0, 40);
    const price = Number(b.price);
    const description = String(b.description || '').slice(0, 2000);
    const imageUrl = sanitizeImageUrl(b.image_url);
    const icon = String(b.icon || 'herramienta').trim().slice(0, 40);
    const stockStatus = ['in', 'low', 'out'].includes(b.stock_status) ? b.stock_status : 'in';
    const stockQuantity = Number.isFinite(Number(b.stock_quantity)) ? Math.max(0, Math.round(Number(b.stock_quantity))) : 0;

    if (!name || !category || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: 'Nombre, categoria y precio valido son obligatorios.' });
    }

    let slug = slugify(name);
    const dup = await pool.query('SELECT id FROM products WHERE slug = $1', [slug]);
    if (dup.rows.length > 0) slug = slug + '-' + Date.now();

    const inserted = await pool.query(
      `INSERT INTO products (slug, name, category, unit, price, description, image_url, icon, stock_status, stock_quantity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [slug, name, category, unit, price, description, imageUrl, icon, stockStatus, stockQuantity]
    );
    res.status(201).json({ ok: true, product: inserted.rows[0] });
  } catch (err) {
    console.error('create product error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo crear el producto.' });
  }
});

router.put('/:id', requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });

    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 200);
    const category = String(b.category || '').trim().slice(0, 60);
    const unit = String(b.unit || 'unidad').trim().slice(0, 40);
    const price = Number(b.price);
    const description = String(b.description || '').slice(0, 2000);
    const imageUrl = sanitizeImageUrl(b.image_url);
    const icon = String(b.icon || 'herramienta').trim().slice(0, 40);
    const stockStatus = ['in', 'low', 'out'].includes(b.stock_status) ? b.stock_status : 'in';
    const active = b.active !== false;

    if (!name || !category || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: 'Nombre, categoria y precio valido son obligatorios.' });
    }

    const updated = await pool.query(
      `UPDATE products SET name=$1, category=$2, unit=$3, price=$4, description=$5,
        image_url=$6, icon=$7, stock_status=$8, active=$9, updated_at=now()
       WHERE id=$10 RETURNING *`,
      [name, category, unit, price, description, imageUrl, icon, stockStatus, active, id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
    res.json({ ok: true, product: updated.rows[0] });
  } catch (err) {
    console.error('update product error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar el producto.' });
  }
});

// Seguimiento de bodega: cada ajuste queda registrado en stock_movements (quien,
// cuanto y por que), en vez de solo sobreescribir el numero.
router.put('/:id/stock', requireAdmin, async function (req, res) {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const changeQty = Math.round(Number(req.body && req.body.change_qty));
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200) || null;
    if (!Number.isInteger(id) || !Number.isInteger(changeQty) || changeQty === 0) {
      return res.status(400).json({ ok: false, error: 'Cantidad invalida.' });
    }

    await client.query('BEGIN');
    const current = await client.query('SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
    }
    const newQty = current.rows[0].stock_quantity + changeQty;
    if (newQty < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Esa salida dejaria el inventario en negativo.' });
    }

    const updated = await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [newQty, id]
    );
    await client.query(
      'INSERT INTO stock_movements (product_id, change_qty, reason, staff_id) VALUES ($1,$2,$3,$4)',
      [id, changeQty, reason, req.user.id]
    );
    await client.query('COMMIT');

    res.json({ ok: true, product: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(function () {});
    console.error('adjust stock error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo ajustar el inventario.' });
  } finally {
    client.release();
  }
});

router.get('/:id/movements', requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });
    const result = await pool.query(
      `SELECT sm.id, sm.change_qty, sm.reason, sm.created_at, u.name AS staff_name
       FROM stock_movements sm LEFT JOIN users u ON u.id = sm.staff_id
       WHERE sm.product_id = $1 ORDER BY sm.created_at DESC LIMIT 50`,
      [id]
    );
    // El nombre del staff esta cifrado en la tabla users; se descifra aqui.
    const movements = result.rows.map(function (r) {
      return Object.assign({}, r, { staff_name: r.staff_name ? decrypt(r.staff_name) : null });
    });
    res.json({ ok: true, movements: movements });
  } catch (err) {
    console.error('list movements error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el historial.' });
  }
});

// Trae el catalogo completo de Alegra y lo refleja en el sitio: crea o
// actualiza (por alegra_item_id) cada producto con su precio y existencia
// real, y desactiva cualquier producto que NO venga de Alegra (los de
// muestra originales del sitio), para que el catalogo publico solo muestre
// el inventario real de la ferreteria.
// Se sube en un solo INSERT ... ON CONFLICT por lote (en vez de 2 consultas por
// producto) porque con el catalogo real (500+ items) el enfoque de una consulta
// por producto tardaba mas de 3 minutos y la peticion nunca alcanzaba a terminar.
const SYNC_BATCH_SIZE = 200;

router.post('/sync-alegra', requireAdmin, async function (req, res) {
  try {
    if (!alegra.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Alegra no esta configurado todavia.' });
    }

    const items = await alegra.fetchAllItems();
    const rows = [];
    for (const item of items) {
      const name = String(item.name || '').trim().slice(0, 200);
      if (!name) continue;

      const priceEntry = Array.isArray(item.price) ? item.price.find(function (p) { return p.main; }) || item.price[0] : null;
      const price = priceEntry ? Math.round(Number(priceEntry.price) || 0) : 0;

      const qty = item.inventory && Number.isFinite(item.inventory.availableQuantity)
        ? Math.max(0, Math.round(item.inventory.availableQuantity))
        : 0;
      const stockStatus = qty <= 0 ? 'out' : (qty <= 5 ? 'low' : 'in');
      const slug = slugify(name) + '-a' + item.id;

      rows.push([slug, name, price, stockStatus, qty, String(item.id)]);
    }

    let created = 0;
    let updated = 0;

    for (let i = 0; i < rows.length; i += SYNC_BATCH_SIZE) {
      const batch = rows.slice(i, i + SYNC_BATCH_SIZE);
      const values = [];
      const placeholders = batch.map(function (row, idx) {
        const base = idx * 6;
        values.push(...row);
        return `($${base + 1},$${base + 2},'general','unidad',$${base + 3},'herramienta',$${base + 4},$${base + 5},$${base + 6})`;
      }).join(',');

      const result = await pool.query(
        `INSERT INTO products (slug, name, category, unit, price, icon, stock_status, stock_quantity, alegra_item_id)
         VALUES ${placeholders}
         ON CONFLICT (alegra_item_id) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           stock_quantity = EXCLUDED.stock_quantity,
           stock_status = EXCLUDED.stock_status,
           active = true,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        values
      );
      for (const r of result.rows) {
        if (r.inserted) created++; else updated++;
      }
    }

    const deactivated = await pool.query(
      "UPDATE products SET active = false, updated_at = now() WHERE alegra_item_id IS NULL AND active = true RETURNING id"
    );

    res.json({
      ok: true,
      total_alegra: items.length,
      created,
      updated,
      deactivated_non_alegra: deactivated.rows.length
    });
  } catch (err) {
    console.error('sync alegra error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo sincronizar con Alegra: ' + err.message });
  }
});

router.delete('/:id', requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });
    // Baja logica: se desactiva en vez de borrar, para no romper cotizaciones ya guardadas.
    await pool.query('UPDATE products SET active = false, updated_at = now() WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete product error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo eliminar el producto.' });
  }
});

module.exports = router;
