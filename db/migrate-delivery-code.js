// Migracion UNICA: agrega el codigo de verificacion de entrega a quotes.
// Segura de correr mas de una vez.
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_code_hash TEXT;`);
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_code_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_started_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;`);
  console.log('Migracion de codigo de entrega completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de codigo de entrega:', err.message);
  process.exit(1);
});
