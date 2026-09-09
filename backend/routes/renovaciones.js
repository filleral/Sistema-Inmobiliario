// Historial de renovaciones de contratos. Antes solo existía un dato suelto
// ("próxima renovación") en el propio contrato, que se perdía cada vez que
// se volvía a editar. Ahora cada renovación registrada queda en esta tabla
// para siempre, y de paso actualiza el canon (y la fecha de vencimiento, si
// se indica una nueva) del contrato, porque la renovación ya es su estado
// vigente.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_RENOVACION, valoresRenovacion } = require('../utils/campos');

const router = express.Router();

function formatearMoneda(numero) {
    const entero = Math.round(numero).toString();
    return '$ ' + entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

router.get('/', verificarToken, async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM renovaciones ORDER BY "fechaRenovacion" DESC, id DESC');
        res.json(resultado.rows);
    } catch (err) {
        console.error('Error listando renovaciones:', err);
        res.status(500).json({ error: 'No se pudieron cargar las renovaciones.' });
    }
});

router.post('/', verificarToken, async (req, res) => {
    const datos = req.body || {};
    if (!datos.contrato || !datos.fechaRenovacion) {
        return res.status(400).json({ error: 'Complete el contrato y la fecha de renovación.' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const valores = valoresRenovacion(datos);
        const nombresColumnas = CAMPOS_RENOVACION.map((c) => `"${c}"`).join(', ');
        const marcadores = CAMPOS_RENOVACION.map((_, i) => `$${i + 1}`).join(', ');
        const insertado = await cliente.query(
            `INSERT INTO renovaciones (${nombresColumnas}) VALUES (${marcadores}) RETURNING *`,
            valores
        );

        // La renovación ya es el estado vigente del contrato: refleja el
        // nuevo canon, y si se dio una nueva fecha de vencimiento, también
        // recalcula la fecha de aviso (90 días antes).
        const asignaciones = [];
        const valoresContrato = [];
        let i = 1;

        if (datos.canonNuevo !== undefined && datos.canonNuevo !== null && datos.canonNuevo !== '') {
            const rawCanon = Number(datos.canonNuevo) || 0;
            asignaciones.push(`"rawCanon" = $${i++}`); valoresContrato.push(rawCanon);
            asignaciones.push(`canon = $${i++}`); valoresContrato.push(formatearMoneda(rawCanon));
        }
        if (datos.nuevaFechaVto) {
            asignaciones.push(`"fechaVto" = $${i++}`); valoresContrato.push(datos.nuevaFechaVto);
            const fechaAviso = new Date(datos.nuevaFechaVto);
            fechaAviso.setDate(fechaAviso.getDate() - 90);
            asignaciones.push(`"fechaAviso" = $${i++}`); valoresContrato.push(fechaAviso.toISOString().slice(0, 10));
        }
        if (asignaciones.length > 0) {
            valoresContrato.push(datos.contrato);
            await cliente.query(
                `UPDATE contratos SET ${asignaciones.join(', ')}, "actualizadoEn" = now() WHERE contrato = $${i}`,
                valoresContrato
            );
        }

        await cliente.query('COMMIT');
        res.status(201).json(insertado.rows[0]);
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('Error creando renovación:', err);
        res.status(500).json({ error: 'No se pudo registrar la renovación.' });
    } finally {
        cliente.release();
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const resultado = await pool.query('DELETE FROM renovaciones WHERE id = $1 RETURNING id', [req.params.id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Renovación no encontrada.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error eliminando renovación:', err);
        res.status(500).json({ error: 'No se pudo eliminar la renovación.' });
    }
});

module.exports = router;
