const express = require('express');
const pool = require('../../db/pool');
const wompi = require('../services/wompi');

const router = express.Router();

// Wompi llama esta URL (configurada en su panel) cada vez que cambia el estado de
// una transaccion. Se valida el checksum del evento antes de creer nada de lo que
// manda: sin eso, cualquiera podria mandar un POST fingiendo un pago aprobado.
router.post('/webhook', async function (req, res) {
  try {
    const body = req.body || {};
    if (body.event !== 'transaction.updated') {
      return res.status(200).json({ ok: true });
    }
    if (!wompi.verifyEventSignature(body)) {
      return res.status(401).json({ ok: false, error: 'Firma invalida.' });
    }

    const tx = body.data && body.data.transaction;
    if (!tx || !tx.reference) {
      return res.status(400).json({ ok: false, error: 'Evento sin transaccion.' });
    }

    let paymentStatus;
    if (tx.status === 'APPROVED') paymentStatus = 'pagado';
    else if (tx.status === 'DECLINED' || tx.status === 'ERROR' || tx.status === 'VOIDED') paymentStatus = 'fallido';
    else paymentStatus = 'pendiente';

    // Un pago aprobado confirma el pedido automaticamente: ya hay dinero de por medio,
    // no tiene sentido que el staff lo vuelva a confirmar manualmente.
    if (paymentStatus === 'pagado') {
      await pool.query(
        "UPDATE quotes SET payment_status = $1, wompi_transaction_id = $2, status = 'confirmada' WHERE wompi_reference = $3",
        [paymentStatus, String(tx.id), tx.reference]
      );
    } else {
      await pool.query(
        'UPDATE quotes SET payment_status = $1, wompi_transaction_id = $2 WHERE wompi_reference = $3',
        [paymentStatus, String(tx.id), tx.reference]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('wompi webhook error:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
