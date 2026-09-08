// Migracion UNICA: agrega soporte de login con Google y cifra en la base de datos los
// datos personales de clientes que ya existian en texto plano (name/email en users,
// customer_name/customer_phone/customer_email en quotes). Es segura de correr mas de
// una vez: cada fila ya migrada se detecta y se salta, no se vuelve a cifrar.
require('dotenv').config();
const pool = require('./pool');
const { encrypt, decrypt, hashForLookup } = require('../src/services/crypto');

function looksAlreadyEncrypted(value) {
  if (!value) return true;
  try { decrypt(value); return true; } catch (err) { return false; }
}

async function migrateSchema() {
  await pool.query(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT tc.constraint_name INTO cname
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'users' AND tc.constraint_type = 'UNIQUE' AND ccu.column_name = 'email';
      IF cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(cname);
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;`);
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`);
  console.log('Esquema de users actualizado (email_hash, google_sub, password_hash nullable).');
}

async function migrateUsers() {
  const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email_hash IS NULL');
  console.log('Usuarios pendientes de cifrar:', rows.length);
  for (const row of rows) {
    const alreadyEncName = looksAlreadyEncrypted(row.name);
    const alreadyEncEmail = looksAlreadyEncrypted(row.email);
    const emailForHash = alreadyEncEmail ? decrypt(row.email) : row.email;
    const emailHash = hashForLookup(emailForHash);
    const newName = alreadyEncName ? row.name : encrypt(row.name);
    const newEmail = alreadyEncEmail ? row.email : encrypt(row.email);
    await pool.query('UPDATE users SET name = $1, email = $2, email_hash = $3 WHERE id = $4', [newName, newEmail, emailHash, row.id]);
    console.log('  usuario', row.id, 'cifrado.');
  }

  await pool.query('ALTER TABLE users ALTER COLUMN email_hash SET NOT NULL;');
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_hash_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_hash_key UNIQUE (email_hash);
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_sub_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);
      END IF;
    END $$;
  `);
  console.log('email_hash: NOT NULL + UNIQUE listo. google_sub: UNIQUE listo.');
}

async function migrateQuotes() {
  const { rows } = await pool.query('SELECT id, customer_name, customer_phone, customer_email FROM quotes');
  let migrated = 0;
  for (const row of rows) {
    if (looksAlreadyEncrypted(row.customer_name) && looksAlreadyEncrypted(row.customer_phone) && looksAlreadyEncrypted(row.customer_email)) {
      continue;
    }
    const newName = looksAlreadyEncrypted(row.customer_name) ? row.customer_name : encrypt(row.customer_name);
    const newPhone = looksAlreadyEncrypted(row.customer_phone) ? row.customer_phone : encrypt(row.customer_phone);
    const newEmail = looksAlreadyEncrypted(row.customer_email) ? row.customer_email : encrypt(row.customer_email);
    await pool.query('UPDATE quotes SET customer_name = $1, customer_phone = $2, customer_email = $3 WHERE id = $4', [newName, newPhone, newEmail, row.id]);
    migrated++;
  }
  console.log('Cotizaciones cifradas en esta corrida:', migrated, '/ total:', rows.length);
}

async function main() {
  await migrateSchema();
  await migrateUsers();
  await migrateQuotes();
  console.log('Migracion de cifrado completada.');
  await pool.end();
}

main().catch(function (err) {
  console.error('Error en migracion de cifrado:', err.message);
  process.exit(1);
});
