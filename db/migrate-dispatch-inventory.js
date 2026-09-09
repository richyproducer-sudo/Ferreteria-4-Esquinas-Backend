// Migracion UNICA: agrega seguimiento de bodega (stock_quantity + stock_movements) y
// de despacho (dispatch_status en quotes). Segura de correr mas de una vez.
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_stock_quantity_check CHECK (stock_quantity >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      change_qty INTEGER NOT NULL,
      reason TEXT,
      staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);`);

  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'pendiente';`);
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS dispatch_updated_at TIMESTAMPTZ;`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_dispatch_status_check') THEN
        ALTER TABLE quotes ADD CONSTRAINT quotes_dispatch_status_check
          CHECK (dispatch_status IN ('pendiente','preparando','despachado','entregado'));
      END IF;
    END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quotes_dispatch_status ON quotes(dispatch_status);`);

  console.log('Migracion de despacho e inventario completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de despacho/inventario:', err.message);
  process.exit(1);
});
