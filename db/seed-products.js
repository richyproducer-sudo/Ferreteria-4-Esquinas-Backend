require('dotenv').config();
const pool = require('./pool');

// Mismo catalogo que ya vive en el sitio (index.html), para que el panel de
// administrador y la API no arranquen vacios. Desde el panel se pueden editar
// precios, agregar descripcion y subir fotos de aqui en adelante.
const PRODUCTS = [
  { slug: 'p1', name: 'Pintura Vinilo Tipo 1 — Pintuland', category: 'pinturas', unit: 'cuñete 5 gal', price: 185000, stock_status: 'in', icon: 'pintura' },
  { slug: 'p2', name: 'Estuco Plástico Interior — Corona Textuco', category: 'pinturas', unit: 'cuñete 5 gal', price: 210000, stock_status: 'in', icon: 'pintura' },
  { slug: 'p3', name: 'Vinilo Tipo 2 Exteriores', category: 'pinturas', unit: 'galón', price: 62000, stock_status: 'low', icon: 'pintura' },
  { slug: 'p4', name: 'Serrucho Bahco 144 16"', category: 'herramientas', unit: 'unidad', price: 68000, stock_status: 'in', icon: 'herramienta' },
  { slug: 'p5', name: 'Martillo de Uña 16oz', category: 'herramientas', unit: 'unidad', price: 32000, stock_status: 'in', icon: 'herramienta' },
  { slug: 'p6', name: 'Pala Cuadrada con Cabo', category: 'herramientas', unit: 'unidad', price: 45000, stock_status: 'in', icon: 'herramienta' },
  { slug: 'p7', name: 'Cinta Métrica 8m', category: 'herramientas', unit: 'unidad', price: 18000, stock_status: 'in', icon: 'herramienta' },
  { slug: 'p8', name: 'Taladro Percutor Inalámbrico 20V', category: 'electricos', unit: 'kit', price: 310000, stock_status: 'low', icon: 'electrico' },
  { slug: 'p9', name: 'Generador Eléctrico Elite 5500W', category: 'electricos', unit: 'unidad', price: 2450000, stock_status: 'low', icon: 'electrico' },
  { slug: 'p10', name: 'Tubería PVC Presión 1/2" x 6m — Tuboplex', category: 'plomeria', unit: 'tubo', price: 28000, stock_status: 'in', icon: 'plomeria' },
  { slug: 'p11', name: 'Codo PVC 1/2"', category: 'plomeria', unit: 'unidad', price: 3500, stock_status: 'in', icon: 'plomeria' },
  { slug: 'p12', name: 'Casco de Seguridad Industrial', category: 'seguridad', unit: 'unidad', price: 35000, stock_status: 'in', icon: 'seguridad' },
  { slug: 'p13', name: 'Guantes de Carnaza', category: 'seguridad', unit: 'par', price: 15000, stock_status: 'in', icon: 'seguridad' },
  { slug: 'p14', name: 'Candado de Seguridad 50mm', category: 'cerrajeria', unit: 'unidad', price: 22000, stock_status: 'in', icon: 'cerrajeria' }
];

async function seedProducts() {
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO products (slug, name, category, unit, price, icon, stock_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category, unit = EXCLUDED.unit,
         price = EXCLUDED.price, icon = EXCLUDED.icon, stock_status = EXCLUDED.stock_status,
         updated_at = now()`,
      [p.slug, p.name, p.category, p.unit, p.price, p.icon, p.stock_status]
    );
  }
  console.log('Catalogo sembrado:', PRODUCTS.length, 'productos.');
  await pool.end();
}

seedProducts().catch(function (err) {
  console.error('Error sembrando productos:', err.message);
  process.exit(1);
});
