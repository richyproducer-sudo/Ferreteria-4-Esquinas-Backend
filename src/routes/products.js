const express = require('express');
const pool = require('../../db/pool');
const { requireAdmin } = require('../middleware/auth');

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

// image_url acepta tanto un link normal (http/https) como una foto subida desde
// el panel, guardada como data URI en base64 — por eso el limite es mucho mas
// alto que el de los demas campos de texto.
function sanitizeImageUrl(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, 3000000);
}

router.get('/', async function (req, res) {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, category, unit, price, description, image_url, icon, stock_status
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

    if (!name || !category || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: 'Nombre, categoria y precio valido son obligatorios.' });
    }

    let slug = slugify(name);
    const dup = await pool.query('SELECT id FROM products WHERE slug = $1', [slug]);
    if (dup.rows.length > 0) slug = slug + '-' + Date.now();

    const inserted = await pool.query(
      `INSERT INTO products (slug, name, category, unit, price, description, image_url, icon, stock_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [slug, name, category, unit, price, description, imageUrl, icon, stockStatus]
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
