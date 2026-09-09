// Migracion UNICA: agrega pago en linea con Wompi a quotes (payment_method,
// payment_status, wompi_reference, wompi_transaction_id). Segura de correr mas de una vez.
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'contra_entrega';`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_payment_method_check') THEN
        ALTER TABLE quotes ADD CONSTRAINT quotes_payment_method_check
          CHECK (payment_method IN ('contra_entrega','wompi'));
      END IF;
    END $$;
  `);

  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pendiente';`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_payment_status_check') THEN
        ALTER TABLE quotes ADD CONSTRAINT quotes_payment_status_check
          CHECK (payment_status IN ('pendiente','pagado','fallido'));
      END IF;
    END $$;
  `);

  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS wompi_reference TEXT;`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_wompi_reference_key') THEN
        ALTER TABLE quotes ADD CONSTRAINT quotes_wompi_reference_key UNIQUE (wompi_reference);
      END IF;
    END $$;
  `);

  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS wompi_transaction_id TEXT;`);

  console.log('Migracion de Wompi completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de Wompi:', err.message);
  process.exit(1);
});
