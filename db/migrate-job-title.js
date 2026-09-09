// Migracion UNICA: agrega la columna job_title (puesto de trabajo) a users.
// Segura de correr mas de una vez (ADD COLUMN IF NOT EXISTS).
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;`);
  console.log('Columna job_title lista.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de job_title:', err.message);
  process.exit(1);
});
