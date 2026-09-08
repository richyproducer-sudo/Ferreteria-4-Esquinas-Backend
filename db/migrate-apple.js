// Migracion UNICA: agrega la columna apple_sub y actualiza la restriccion CHECK de
// users para permitir cuentas creadas solo con Apple (sin contraseña ni Google).
// Segura de correr mas de una vez (todo usa IF NOT EXISTS / busqueda dinamica).
require('dotenv').config();
const pool = require('./pool');

async function main() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT;`);

  await pool.query(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users' AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%google_sub%';
      IF cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(cname);
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE users ADD CONSTRAINT users_login_method_check
      CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL OR apple_sub IS NOT NULL);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_apple_sub_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_apple_sub_key UNIQUE (apple_sub);
      END IF;
    END $$;
  `);

  console.log('Migracion de Apple Sign-In completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de Apple:', err.message);
  process.exit(1);
});
