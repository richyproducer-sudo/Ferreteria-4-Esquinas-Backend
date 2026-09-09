// Integracion con el Widget de Checkout Web de Wompi (https://docs.wompi.co).
// Si las llaves no estan configuradas, isConfigured() da false y el frontend
// simplemente no ofrece la opcion de pagar en linea (el flujo de cotizar y
// pagar contra entrega sigue funcionando igual).

const crypto = require('crypto');

function isConfigured() {
  return Boolean(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET);
}

function isWebhookConfigured() {
  return Boolean(process.env.WOMPI_EVENTS_SECRET);
}

// Firma de integridad del widget: SHA256("<referencia><monto_en_centavos><moneda><secreto>").
// La calcula el servidor para que el secreto de integridad nunca llegue al navegador.
function computeIntegritySignature(reference, amountInCents, currency) {
  const raw = String(reference) + String(amountInCents) + String(currency) + process.env.WOMPI_INTEGRITY_SECRET;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function buildCheckoutData({ reference, amountInCents, currency, redirectUrl }) {
  const curr = currency || 'COP';
  return {
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    currency: curr,
    amountInCents,
    reference,
    signature: computeIntegritySignature(reference, amountInCents, curr),
    redirectUrl: redirectUrl || null
  };
}

function getByPath(root, path) {
  return path.split('.').reduce(function (acc, key) { return acc == null ? undefined : acc[key]; }, root);
}

// Valida el checksum del evento (transaction.updated) siguiendo las propiedades que el
// propio evento indica en signature.properties (Wompi advierte que esta lista puede
// cambiar, por eso nunca se asume fija) + el timestamp + el secreto de eventos.
function verifyEventSignature(eventBody) {
  if (!isWebhookConfigured()) return false;
  const sig = eventBody && eventBody.signature;
  if (!sig || !Array.isArray(sig.properties) || !sig.checksum) return false;

  const concatenated = sig.properties.map(function (path) {
    return String(getByPath(eventBody.data, path));
  }).join('');
  const raw = concatenated + String(eventBody.timestamp) + process.env.WOMPI_EVENTS_SECRET;
  const checksum = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return checksum === sig.checksum;
}

module.exports = { isConfigured, isWebhookConfigured, buildCheckoutData, verifyEventSignature };
