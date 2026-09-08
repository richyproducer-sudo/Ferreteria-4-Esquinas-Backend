const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({ jwksUri: 'https://appleid.apple.com/auth/keys', cache: true, cacheMaxAge: 12 * 60 * 60 * 1000 });

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/** Verifica un id_token de "Sign in with Apple" contra las llaves publicas de Apple. */
function verifyAppleIdToken(idToken) {
  return new Promise(function (resolve, reject) {
    jwt.verify(
      idToken,
      getSigningKey,
      { algorithms: ['RS256'], audience: process.env.APPLE_CLIENT_ID, issuer: 'https://appleid.apple.com' },
      function (err, payload) {
        if (err) return reject(err);
        resolve(payload);
      }
    );
  });
}

module.exports = { verifyAppleIdToken };
