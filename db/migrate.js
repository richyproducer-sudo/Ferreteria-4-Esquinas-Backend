require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migracion completada: tablas creadas/verificadas.');
  await pool.end();
}

migrate().catch(function (err) {
  console.error('Error en migracion:', err.message);
  process.exit(1);
});
