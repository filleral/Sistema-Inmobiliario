// Respaldar Todo / Restaurar Respaldo, ahora contra la base de datos real
// en vez de localStorage. Mismo formato de archivo que ya usaba la app:
// { app, version, fecha, datos: { brw_datosBase: [...], brw_datosPagos_v10: [...] } }
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, valoresContrato, valoresPago } = require('../utils/campos');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const [contratosRes, pagosRes] = await Promise.all([
            pool.query('SELECT * FROM contratos ORDER BY id'),
            pool.query('SELECT * FROM pagos ORDER BY id'),
        ]);

        res.json({
            app: 'Bienes Raíces White - Sistema de Arriendos',
            version: 1,
            fecha: new Date().toISOString(),
            datos: {
                brw_datosBase: contratosRes.rows,
                brw_datosPagos_v10: pagosRes.rows,
            },
        });
    } catch (err) {
        console.error('Error generando respaldo:', err);
        res.status(500).json({ error: 'No se pudo generar el respaldo.' });
    }
});

router.post('/restaurar', verificarToken, async (req, res) => {
    const datos = req.body?.datos;
    const contratos = Array.isArray(datos?.brw_datosBase) ? datos.brw_datosBase : null;
    const pagos = Array.isArray(datos?.brw_datosPagos_v10) ? datos.brw_datosPagos_v10 : null;

    if (!contratos || !pagos) {
        return res.status(400).json({ error: 'El archivo no tiene la estructura de un respaldo válido de este sistema.' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query('TRUNCATE contratos RESTART IDENTITY');
        await cliente.query('TRUNCATE pagos RESTART IDENTITY');

        const nombresColumnasContrato = CAMPOS_CONTRATO.map((c) => `"${c}"`).join(', ');
        const marcadoresContrato = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');
        for (const c of contratos) {
            await cliente.query(
                `INSERT INTO contratos (${nombresColumnasContrato}) VALUES (${marcadoresContrato})`,
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
        console.error('Error restaurando respaldo:', err);
        res.status(500).json({ error: 'No se pudo restaurar el respaldo. No se cambió ningún dato.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
