const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');

// El JWT solo prueba QUIEN es el usuario, no en que estado esta su cuenta ahora mismo:
// se vuelve a consultar el rol y el "active" reales en cada peticion protegida, para que
// desactivar una cuenta o quitarle el rol de admin surta efecto de inmediato (y no solo
// hasta que expire un token de hasta 7 dias que ya fue emitido).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Falta iniciar sesion.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, role, active FROM users WHERE id = $1', [payload.id]);
    const row = result.rows[0];
    if (!row || row.active === false) {
      return res.status(401).json({ ok: false, error: 'Sesion invalida o expirada.' });
    }
    req.user = { id: payload.id, name: payload.name, email: payload.email, role: row.role };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Sesion invalida o expirada.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, function () {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ ok: false, error: 'No tienes permisos de administrador.' });
    }
    next();
  });
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, function () {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ ok: false, error: 'No tienes permisos de super administrador.' });
    }
    next();
  });
}

// Adjunta req.user si viene un token valido, pero nunca bloquea la peticion.
// Se usa en rutas publicas (como enviar una cotizacion) que igual funcionan sin sesion.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // token invalido/expirado: se ignora, la peticion sigue como anonima
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, optionalAuth };
