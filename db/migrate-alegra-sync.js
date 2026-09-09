// Migracion UNICA: agrega la columna alegra_item_id a products (para poder
// sincronizar el catalogo de Alegra sin duplicar productos en re-sincronizaciones).
// Segura de correr mas de una vez.
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS alegra_item_id TEXT;`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_alegra_item_id_key') THEN
        ALTER TABLE products ADD CONSTRAINT products_alegra_item_id_key UNIQUE (alegra_item_id);
      END IF;
    END $$;
  `);
  console.log('Columna alegra_item_id lista.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de alegra_item_id:', err.message);
  process.exit(1);
});
