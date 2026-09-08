require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const quoteRoutes = require('./routes/quotes');
const staffRoutes = require('./routes/staff');

const app = express();

// El limite es mas alto que lo usual porque las fotos de producto subidas desde
// el panel de administrador viajan como imagen codificada en base64 dentro del JSON.
app.use(express.json({ limit: '4mb' }));

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Sin origin (curl, health checks) o dentro de la lista permitida.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    callback(new Error('Origen no permitido por CORS: ' + origin));
  }
}));

app.get('/api/health', function (req, res) {
  res.json({ ok: true, service: 'ferreteria-4-esquinas-backend', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/staff', staffRoutes);

app.use(function (req, res) {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use(function (err, req, res, next) {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, function () {
  console.log('Ferreteria 4 Esquinas backend escuchando en puerto ' + PORT);
});
