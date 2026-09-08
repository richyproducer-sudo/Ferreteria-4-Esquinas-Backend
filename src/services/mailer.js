const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return cachedTransporter;
}

/**
 * Envia un correo. Si SMTP_USER/SMTP_PASS no estan configurados, no hace nada y
 * retorna { sent:false } — nunca lanza, para que el flujo que lo llama pueda seguir
 * respondiendo de forma generica sin filtrar si el envio realmente ocurrio.
 */
async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('SMTP no configurado: correo no enviado a', to);
    return { sent: false };
  }
  try {
    await transporter.sendMail({
      from: 'Ferretería 4 Esquinas <' + process.env.SMTP_USER + '>',
      to, subject, text, html
    });
    return { sent: true };
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendMail };
