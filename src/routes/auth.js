const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/register', authLimiter, async function (req, res) {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
    const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 160);
    const password = String((req.body && req.body.password) || '');

    if (!name || !isValidEmail(email) || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Nombre, correo valido y contraseña de al menos 8 caracteres son obligatorios.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese correo.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role`,
      [name, email, hash]
    );
    const user = inserted.rows[0];
    res.json({ ok: true, token: signToken(user), user });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo crear la cuenta.' });
  }
});

router.post('/login', authLimiter, async function (req, res) {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const row = result.rows[0];
    if (!row) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }

    const user = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.json({ ok: true, token: signToken(user), user });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo iniciar sesion.' });
  }
});

module.exports = router;
