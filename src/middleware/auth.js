const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Falta iniciar sesion.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Sesion invalida o expirada.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, function () {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'No tienes permisos de administrador.' });
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

module.exports = { requireAuth, requireAdmin, optionalAuth };
