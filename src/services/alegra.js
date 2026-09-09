// Integracion real con la API de Alegra (https://developer.alegra.com).
// Si ALEGRA_EMAIL / ALEGRA_TOKEN no estan configurados, todas las funciones
// se omiten silenciosamente (retornan null) para que una cotizacion nunca
// falle por culpa de Alegra: siempre queda guardada en la base de datos local.

const ALEGRA_BASE = 'https://api.alegra.com/api/v1';

// Colombia (DIAN) exige un tipo/numero de identificacion para poder crear un
// contacto. Como no le pedimos cedula/NIT a los clientes del sitio (solo
// nombre y telefono), se usa el contacto generico "Consumidor Final" que
// Alegra ya trae por defecto en toda cuenta colombiana — el nombre y telefono
// reales del cliente quedan en las observaciones de la cotizacion.
const CONSUMIDOR_FINAL_ID_NUMBER = '222222222222';

function isConfigured() {
  return Boolean(process.env.ALEGRA_EMAIL && process.env.ALEGRA_TOKEN);
}

function authHeader() {
  const raw = process.env.ALEGRA_EMAIL + ':' + process.env.ALEGRA_TOKEN;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
}

async function alegraFetch(path, options) {
  const res = await fetch(ALEGRA_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(options && options.headers)
    }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || JSON.stringify(data))) || res.statusText;
    throw new Error('Alegra API ' + res.status + ': ' + message);
  }
  return data;
}

async function getConsumidorFinal() {
  const query = new URLSearchParams({ identification: CONSUMIDOR_FINAL_ID_NUMBER }).toString();
  const found = await alegraFetch('/contacts?' + query, { method: 'GET' });
  if (Array.isArray(found) && found.length > 0) {
    return found[0];
  }
  // No debería faltar (Alegra la trae por defecto), pero por si acaso se crea.
  return alegraFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({ name: 'Consumidor Final', type: ['client'], identification: CONSUMIDOR_FINAL_ID_NUMBER })
  });
}

async function findOrCreateItem({ name, price }) {
  const query = new URLSearchParams({ name }).toString();
  const found = await alegraFetch('/items?' + query, { method: 'GET' });
  if (Array.isArray(found) && found.length > 0) {
    return found[0];
  }
  return alegraFetch('/items', {
    method: 'POST',
    body: JSON.stringify({
      name,
      price: [{ price }],
      inventory: { unit: 'unit' }
    })
  });
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Crea una cotizacion (estimate) en Alegra a partir de una cotizacion local.
 * Retorna el estimate creado, o null si Alegra no esta configurado.
 * Cualquier error se propaga para que el caller decida como registrarlo,
 * pero nunca debe impedir que la cotizacion local ya se haya guardado.
 */
async function syncQuoteToAlegra({ customerName, customerPhone, customerEmail, items }) {
  if (!isConfigured()) return null;

  const contact = await getConsumidorFinal();

  const alegraItems = [];
  for (const item of items) {
    const alegraItem = await findOrCreateItem({ name: item.product_name, price: item.unit_price });
    alegraItems.push({
      id: alegraItem.id,
      price: item.unit_price,
      quantity: item.qty
    });
  }

  const today = new Date();
  const dueDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const observationsParts = ['Cliente: ' + customerName, 'Tel: ' + customerPhone];
  if (customerEmail) observationsParts.push('Correo: ' + customerEmail);

  const estimate = await alegraFetch('/estimates', {
    method: 'POST',
    body: JSON.stringify({
      client: { id: contact.id },
      date: formatDate(today),
      dueDate: formatDate(dueDate),
      items: alegraItems,
      observations: observationsParts.join(' | ')
    })
  });

  return estimate;
}

module.exports = { isConfigured, syncQuoteToAlegra };
