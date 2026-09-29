// Respaldar Todo / Restaurar Respaldo, ahora contra la base de datos real
// en vez de localStorage. Mismo formato de archivo que ya usaba la app:
// { app, version, fecha, datos: { brw_datosBase: [...], brw_datosPagos_v10: [...], brw_renovaciones: [...] } }
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, CAMPOS_RENOVACION, valoresContrato, valoresPago, valoresRenovacion } = require('../utils/campos');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const [contratosRes, pagosRes, renovacionesRes] = await Promise.all([
            pool.query('SELECT * FROM contratos ORDER BY id'),
            pool.query('SELECT * FROM pagos ORDER BY id'),
            pool.query('SELECT * FROM renovaciones ORDER BY id'),
        ]);

        res.json({
            app: 'Bienes Raíces White - Sistema de Arriendos',
            version: 1,
            fecha: new Date().toISOString(),
            datos: {
                brw_datosBase: contratosRes.rows,
                brw_datosPagos_v10: pagosRes.rows,
                brw_renovaciones: renovacionesRes.rows,
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
    // Los respaldos anteriores a esta función no traen renovaciones: se
    // toma como lista vacía en vez de rechazar el archivo completo.
    const renovaciones = Array.isArray(datos?.brw_renovaciones) ? datos.brw_renovaciones : [];

    if (!contratos || !pagos) {
        return res.status(400).json({ error: 'El archivo no tiene la estructura de un respaldo válido de este sistema.' });
    }

    if (contratos.length === 0 && pagos.length === 0) {
        return res.status(400).json({ error: 'El archivo de respaldo no contiene contratos ni recibos. Por seguridad no se borraron los datos existentes.' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query('TRUNCATE contratos RESTART IDENTITY');
        await cliente.query('TRUNCATE pagos RESTART IDENTITY');
        await cliente.query('TRUNCATE renovaciones RESTART IDENTITY');

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

        const nombresColumnasRenovacion = CAMPOS_RENOVACION.map((c) => `"${c}"`).join(', ');
        const marcadoresRenovacion = CAMPOS_RENOVACION.map((_, i) => `$${i + 1}`).join(', ');
        for (const r of renovaciones) {
            await cliente.query(
                `INSERT INTO renovaciones (${nombresColumnasRenovacion}) VALUES (${marcadoresRenovacion})`,
                valoresRenovacion(r)
            );
        }

        await cliente.query('COMMIT');
        res.json({ ok: true, contratos: contratos.length, pagos: pagos.length, renovaciones: renovaciones.length });
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('Error restaurando respaldo:', err);
        res.status(500).json({ error: 'No se pudo restaurar el respaldo. No se cambió ningún dato.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
