const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const { requireSuperAdmin } = require('../middleware/auth');
const { encrypt, decrypt, hashForLookup } = require('../services/crypto');

const router = express.Router();

function toStaffView(row) {
  return {
    id: row.id,
    name: decrypt(row.name),
    email: decrypt(row.email),
    role: row.role,
    job_title: row.job_title,
    active: row.active,
    created_at: row.created_at
  };
}

function sanitizeJobTitle(value) {
  if (!value) return null;
  const str = String(value).trim().slice(0, 60);
  return str || null;
}

// Todo lo que hay aqui es solo para admin/superadmin — nunca para cuentas de cliente.
router.get('/', requireSuperAdmin, async function (req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, job_title, active, created_at FROM users
       WHERE role IN ('admin','superadmin') ORDER BY created_at ASC`
    );
    res.json({ ok: true, staff: result.rows.map(toStaffView) });
  } catch (err) {
    console.error('list staff error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el personal.' });
  }
});

router.post('/', requireSuperAdmin, async function (req, res) {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const password = String(b.password || '');
    const role = ['admin', 'superadmin'].includes(b.role) ? b.role : 'admin';
    const jobTitle = sanitizeJobTitle(b.job_title);

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Nombre, correo valido y contraseña de al menos 8 caracteres son obligatorios.' });
    }

    const emailHash = hashForLookup(email);
    const existing = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese correo.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, email_hash, password_hash, role, job_title) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, email, role, job_title, active, created_at`,
      [encrypt(name), encrypt(email), emailHash, passwordHash, role, jobTitle]
    );
    res.status(201).json({ ok: true, staff: toStaffView(inserted.rows[0]) });
  } catch (err) {
    console.error('create staff error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo crear la cuenta.' });
  }
});

router.put('/:id/job-title', requireSuperAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });
    const jobTitle = sanitizeJobTitle(req.body && req.body.job_title);
    const updated = await pool.query(
      'UPDATE users SET job_title = $1 WHERE id = $2 AND role IN (\'admin\',\'superadmin\') RETURNING id, name, email, role, job_title, active, created_at',
      [jobTitle, id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
    res.json({ ok: true, staff: toStaffView(updated.rows[0]) });
  } catch (err) {
    console.error('update staff job-title error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar el puesto.' });
  }
});

router.put('/:id/active', requireSuperAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    const active = Boolean(req.body && req.body.active);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });
    if (id === req.user.id && !active) {
      return res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta.' });
    }
    const updated = await pool.query(
      'UPDATE users SET active = $1 WHERE id = $2 AND role IN (\'admin\',\'superadmin\') RETURNING id, name, email, role, job_title, active, created_at',
      [active, id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
    res.json({ ok: true, staff: toStaffView(updated.rows[0]) });
  } catch (err) {
    console.error('toggle staff active error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar la cuenta.' });
  }
});

router.put('/:id/role', requireSuperAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    const role = req.body && req.body.role;
    if (!Number.isInteger(id) || !['admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Datos invalidos.' });
    }
    if (id === req.user.id && role !== 'superadmin') {
      return res.status(400).json({ ok: false, error: 'No puedes quitarte tu propio rol de super administrador.' });
    }
    const updated = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 AND role IN (\'admin\',\'superadmin\') RETURNING id, name, email, role, job_title, active, created_at',
      [role, id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
    res.json({ ok: true, staff: toStaffView(updated.rows[0]) });
  } catch (err) {
    console.error('update staff role error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar la cuenta.' });
  }
});

router.delete('/:id', requireSuperAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Id invalido.' });
    if (id === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propia cuenta.' });
    }
    // Los productos no dependen del staff; las cotizaciones (quotes.user_id) tienen
    // ON DELETE SET NULL, asi que eliminar una cuenta nunca rompe su historial.
    const deleted = await pool.query(
      'DELETE FROM users WHERE id = $1 AND role IN (\'admin\',\'superadmin\') RETURNING id',
      [id]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete staff error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo eliminar la cuenta.' });
  }
});

module.exports = router;
