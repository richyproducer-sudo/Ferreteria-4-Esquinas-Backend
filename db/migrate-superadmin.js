// Migracion UNICA: agrega la columna "active" a users, permite el rol 'superadmin' en la
// restriccion CHECK de role, y promueve la cuenta que ya exista con ADMIN_EMAIL a superadmin
// (asi el dueño de la ferreteria queda con el nivel mas alto desde el primer momento).
// Segura de correr mas de una vez.
require('dotenv').config();
const pool = require('./pool');
const { hashForLookup } = require('../src/services/crypto');

async function main() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;`);

  await pool.query(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users' AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%role = ANY%';
      IF cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(cname);
      END IF;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('customer','admin','superadmin'));
  `);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const emailHash = hashForLookup(adminEmail);
    const result = await pool.query(
      "UPDATE users SET role = 'superadmin' WHERE email_hash = $1 AND role = 'admin' RETURNING id",
      [emailHash]
    );
    console.log('Promovido a superadmin:', result.rows.length > 0 ? result.rows[0].id : '(sin cambios, ya lo era o no existe)');
  } else {
    console.log('ADMIN_EMAIL no definido: no se promovio ninguna cuenta automaticamente.');
  }

  console.log('Migracion de superadmin completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de superadmin:', err.message);
  process.exit(1);
});
