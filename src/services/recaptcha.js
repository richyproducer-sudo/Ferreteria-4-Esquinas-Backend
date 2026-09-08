// Verificacion de Google reCAPTCHA v3. Si RECAPTCHA_SECRET_KEY no esta configurada,
// se omite (retorna ok:true) para que el sitio nunca se rompa por esto — igual que
// Alegra/Google/Apple, la proteccion se activa sola en cuanto se agregan las llaves.
async function verifyRecaptcha(token, expectedAction) {
  if (!process.env.RECAPTCHA_SECRET_KEY) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing_token' };

  try {
    const params = new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: token });
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await res.json();

    if (!data.success) return { ok: false, reason: 'verify_failed' };
    if (expectedAction && data.action !== expectedAction) return { ok: false, reason: 'action_mismatch' };
    if (typeof data.score === 'number' && data.score < 0.5) return { ok: false, reason: 'low_score', score: data.score };

    return { ok: true, score: data.score };
  } catch (err) {
    console.error('recaptcha verify error:', err.message);
    // Un fallo de red hacia Google no debe tumbar el registro/login/cotizacion.
    return { ok: true, skipped: true, networkError: true };
  }
}

module.exports = { verifyRecaptcha };
