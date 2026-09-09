-- name y email se guardan CIFRADOS (AES-256-GCM, ver src/services/crypto.js), nunca en
-- texto plano. email_hash es un HMAC determinista del correo (en minusculas) que permite
-- buscar/city un usuario por correo sin tener que descifrar toda la tabla ni guardar el
-- correo real de forma reversible con una simple consulta SQL.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hash TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  apple_sub TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','superadmin')),
  -- Puesto de trabajo (Cajero, Bodega, Dueño, etc.) — es solo una etiqueta organizativa,
  -- libre de escribir; el nivel de permisos real sigue siendo "role" (admin/superadmin).
  job_title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL OR apple_sub IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unidad',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  icon TEXT NOT NULL DEFAULT 'herramienta',
  stock_status TEXT NOT NULL DEFAULT 'in' CHECK (stock_status IN ('in','low','out')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- customer_name/phone/email tambien van cifrados (misma razon que en users) — un pedido
-- de cotizacion de un cliente que ni siquiera se registro sigue siendo un dato personal.
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','confirmada','cancelada')),
  alegra_estimate_id TEXT,
  alegra_synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0)
);

-- El token real solo se manda por correo; aqui se guarda su hash SHA-256, nunca el
-- valor en claro, para que ni siquiera con acceso a la base de datos se pueda usar
-- un enlace de recuperacion ya emitido.
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
