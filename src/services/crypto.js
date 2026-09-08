const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY no esta configurada en las variables de entorno.');
  }
  // Se acepta una clave de 32 bytes en base64; si no tiene ese tamano exacto, se deriva
  // una clave de 32 bytes a partir del valor dado (para tolerar una clave "de cualquier
  // tamano" pegada a mano sin romper el cifrado).
  let key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    key = crypto.scryptSync(raw, 'ferreteria-4-esquinas-encryption', 32);
  }
  cachedKey = key;
  return key;
}

/**
 * Cifra un texto con AES-256-GCM. Cada llamada usa un IV aleatorio distinto, asi que
 * cifrar el mismo texto dos veces da resultados distintos (por diseno: evita que alguien
 * con acceso a la base de datos pueda comparar filas cifradas para adivinar valores
 * repetidos). Por eso las busquedas por correo usan hashForLookup, no este valor.
 */
function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/** HMAC-SHA256 deterministico, usado solo para poder buscar/indexar por correo sin guardarlo en texto plano. */
function hashForLookup(value) {
  const key = getKey();
  return crypto.createHmac('sha256', key).update(String(value).toLowerCase().trim()).digest('hex');
}

module.exports = { encrypt, decrypt, hashForLookup };
