const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../../db/pool');
const { encrypt, decrypt, hashForLookup } = require('../services/crypto');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
});

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

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

// Convierte una fila cruda de la tabla users (con name/email cifrados) en el objeto
// { id, name, email, role } que se manda al frontend y se firma en el JWT.
function toPublicUser(row) {
  return { id: row.id, name: decrypt(row.name), email: decrypt(row.email), role: row.role };
}

router.post('/register', authLimiter, async function (req, res) {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
    const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 160);
    const password = String((req.body && req.body.password) || '');

    if (!name || !isValidEmail(email) || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Nombre, correo valido y contraseña de al menos 8 caracteres son obligatorios.' });
    }

    const emailHash = hashForLookup(email);
    const existing = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese correo.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, email_hash, password_hash, role) VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, name, email, role`,
      [encrypt(name), encrypt(email), emailHash, passwordHash]
    );
    const user = toPublicUser(inserted.rows[0]);
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

    const emailHash = hashForLookup(email);
    const result = await pool.query('SELECT * FROM users WHERE email_hash = $1', [emailHash]);
    const row = result.rows[0];
    if (!row || !row.password_hash) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }

    const user = toPublicUser(row);
    res.json({ ok: true, token: signToken(user), user });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo iniciar sesion.' });
  }
});

router.post('/google', authLimiter, async function (req, res) {
  try {
    if (!googleClient) {
      return res.status(503).json({ ok: false, error: 'El inicio de sesion con Google no esta configurado todavia.' });
    }
    const idToken = req.body && req.body.credential;
    if (!idToken) {
      return res.status(400).json({ ok: false, error: 'Falta el token de Google.' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ ok: false, error: 'No se pudo verificar la cuenta de Google.' });
    }

    const email = String(payload.email).trim().toLowerCase();
    const name = String(payload.name || email.split('@')[0]).slice(0, 120);
    const googleSub = String(payload.sub);
    const emailHash = hashForLookup(email);

    let row;
    const bySub = await pool.query('SELECT * FROM users WHERE google_sub = $1', [googleSub]);
    if (bySub.rows.length > 0) {
      row = bySub.rows[0];
    } else {
      const byEmail = await pool.query('SELECT * FROM users WHERE email_hash = $1', [emailHash]);
      if (byEmail.rows.length > 0) {
        // Ya existia una cuenta con ese correo (creada con contraseña) — se vincula con Google.
        const linked = await pool.query('UPDATE users SET google_sub = $1 WHERE id = $2 RETURNING *', [googleSub, byEmail.rows[0].id]);
        row = linked.rows[0];
      } else {
        const inserted = await pool.query(
          `INSERT INTO users (name, email, email_hash, google_sub, role) VALUES ($1, $2, $3, $4, 'customer') RETURNING *`,
          [encrypt(name), encrypt(email), emailHash, googleSub]
        );
        row = inserted.rows[0];
      }
    }

    const user = toPublicUser(row);
    res.json({ ok: true, token: signToken(user), user });
  } catch (err) {
    console.error('google auth error:', err.message);
    res.status(401).json({ ok: false, error: 'No se pudo verificar la cuenta de Google.' });
  }
});

module.exports = router;
