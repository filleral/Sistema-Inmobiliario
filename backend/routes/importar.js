// Recibe contratos y/o pagos ya parseados por el navegador (desde "Importar
// CSV") e inserta todo en una sola transacción. El parseo del .csv se queda
// en el frontend (analizarLineaCSV, MAPEO_CSV_IMPORTACION); este endpoint
// solo persiste lo que ya llega armado.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, valoresContrato, valoresPago } = require('../utils/campos');

const router = express.Router();

router.post('/', verificarToken, async (req, res) => {
    const contratos = Array.isArray(req.body?.contratos) ? req.body.contratos : [];
    const pagos = Array.isArray(req.body?.pagos) ? req.body.pagos : [];

    if (contratos.length === 0 && pagos.length === 0) {
        return res.status(400).json({ error: 'No se recibió ningún contrato ni recibo para importar.' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const nombresColumnasContrato = CAMPOS_CONTRATO.map((c) => `"${c}"`).join(', ');
        const marcadoresContrato = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');
        for (const c of contratos) {
            // ON CONFLICT DO NOTHING: si el CSV trae un número de contrato que
            // ya existe, se omite en vez de romper toda la importación.
            await cliente.query(
                `INSERT INTO contratos (${nombresColumnasContrato}) VALUES (${marcadoresContrato}) ON CONFLICT (contrato) DO NOTHING`,
                valoresContrato(c)
            );
        }

        const nombresColumnasPago = CAMPOS_PAGO.map((c) => `"${c}"`).join(', ');
        const marcadoresPago = CAMPOS_PAGO.map((_, i) => `$${i + 1}`).join(', ');
        for (const p of pagos) {
            await cliente.query(
                `INSERT INTO pagos (${nombresColumnasPago}) VALUES (${marcadoresPago})`,
                valoresPago(p)
            );
        }

        await cliente.query('COMMIT');
        res.json({ ok: true, contratos: contratos.length, pagos: pagos.length });
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('Error importando CSV:', err);
        res.status(500).json({ error: 'No se pudo completar la importación. No se guardó ningún cambio.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
