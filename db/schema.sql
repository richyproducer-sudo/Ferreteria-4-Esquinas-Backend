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
  -- Cantidad real en bodega (para el seguimiento de inventario); stock_status sigue
  -- siendo la etiqueta que ve el cliente en el catalogo.
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  -- Id del item en Alegra cuando el producto vino de una sincronizacion; permite
  -- volver a sincronizar (actualizar en vez de duplicar) sin ambiguedad.
  alegra_item_id TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial de entradas/salidas de bodega — el "seguimiento" real: quien movio
-- cuanto de cada producto y cuando.
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_qty INTEGER NOT NULL,
  reason TEXT,
  staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  -- Seguimiento del despacho fisico, independiente del estado comercial de arriba.
  dispatch_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (dispatch_status IN ('pendiente','preparando','despachado','entregado')),
  dispatch_updated_at TIMESTAMPTZ,
  -- Codigo de verificacion de entrega: solo se guarda su hash SHA-256 (igual que
  -- password_resets); el codigo real solo lo tiene el cliente, se lo dan por WhatsApp
  -- al iniciar la entrega y se lo debe repetir al repartidor para poder finalizarla.
  delivery_code_hash TEXT,
  delivery_code_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_started_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
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
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_dispatch_status ON quotes(dispatch_status);
