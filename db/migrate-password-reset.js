// Migracion UNICA: crea la tabla password_resets. Segura de correr mas de una vez
// (CREATE TABLE IF NOT EXISTS).
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);`);
  console.log('Tabla password_resets lista.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de password_resets:', err.message);
  process.exit(1);
});
