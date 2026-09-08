require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Administrador';

  if (!email || !password) {
    console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD en las variables de entorno antes de correr este script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', name = EXCLUDED.name`,
    [name, email, hash]
  );

  console.log('Administrador listo:', email);
  await pool.end();
}

seedAdmin().catch(function (err) {
  console.error('Error creando administrador:', err.message);
  process.exit(1);
});
