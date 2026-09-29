// CRUD de recibos de caja / pagos.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_PAGO, valoresPago } = require('../utils/campos');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM pagos ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (err) {
        console.error('Error listando pagos:', err);
        res.status(500).json({ error: 'No se pudieron cargar los recibos.' });
    }
});

router.post('/', verificarToken, async (req, res) => {
    const datos = req.body || {};
    if (!datos.arrendatario || !datos.contrato || !datos.fechaPago) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (*).' });
    }

    const valores = valoresPago(datos);
    const nombresColumnas = CAMPOS_PAGO.map((c) => `"${c}"`).join(', ');
    const marcadores = CAMPOS_PAGO.map((_, i) => `$${i + 1}`).join(', ');

    try {
        const resultado = await pool.query(
            `INSERT INTO pagos (${nombresColumnas}) VALUES (${marcadores}) RETURNING *`,
            valores
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        console.error('Error creando recibo:', err);
        res.status(500).json({ error: 'No se pudo guardar el recibo.' });
    }
});

router.put('/:id', verificarToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de recibo inválido.' });
    }

    const datos = req.body || {};
    if (!datos.arrendatario || !datos.contrato || !datos.fechaPago) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (*).' });
    }

    const valores = valoresPago(datos);
    const asignaciones = CAMPOS_PAGO.map((c, i) => `"${c}" = $${i + 1}`).join(', ');

    try {
        const resultado = await pool.query(
            `UPDATE pagos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${CAMPOS_PAGO.length + 1} RETURNING *`,
            [...valores, id]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Recibo no encontrado.' });
        }
        res.json(resultado.rows[0]);
    } catch (err) {
        console.error('Error actualizando recibo:', err);
        res.status(500).json({ error: 'No se pudo actualizar el recibo.' });
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de recibo inválido.' });
    }

    try {
        const resultado = await pool.query('DELETE FROM pagos WHERE id = $1 RETURNING id', [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Recibo no encontrado.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error eliminando recibo:', err);
        res.status(500).json({ error: 'No se pudo eliminar el recibo.' });
    }
});

module.exports = router;
