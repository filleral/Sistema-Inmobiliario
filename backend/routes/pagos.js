// CRUD de recibos de caja / pagos.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_PAGO, valoresPago } = require('../utils/campos');

const router = express.Router();

function textoLimpio(v) {
    return (v === undefined || v === null) ? '' : String(v).trim();
}

function numeroONulo(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// Un No. de Recibo de Caja no se puede repetir entre recibos distintos. Se
// toma un candado de transacción por número (pg_advisory_xact_lock) para
// que dos guardados simultáneos con el mismo número no pasen ambos la
// verificación. Devuelve el recibo que ya tiene ese número, o null.
async function buscarReciboConNumero(cliente, numero, idExcluir) {
    await cliente.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['recibo-caja:' + numero]);
    const res = await cliente.query(
        'SELECT id, contrato, mes, ano, arrendatario FROM pagos WHERE TRIM("numeroReciboCaja") = $1 AND id <> $2 LIMIT 1',
        [numero, idExcluir || 0]
    );
    return res.rows[0] || null;
}

function mensajeReciboDuplicado(numero, otro) {
    return `El Recibo de Caja No. ${numero} ya está registrado (contrato #${otro.contrato}, ${otro.mes}/${otro.ano}, ${otro.arrendatario}). Verifique el número.`;
}

// Valor consignado vs. valor esperado: si se registró lo consignado y no
// coincide con lo esperado (canon - descuento), el motivo es obligatorio.
function validarDiferencia(datos) {
    const consignado = numeroONulo(datos.valorConsignado);
    if (consignado === null) return null;
    const esperado = Number(datos.totalConsignado) || 0;
    if (Math.round(consignado) !== Math.round(esperado) && !textoLimpio(datos.motivoDiferencia)) {
        return 'El valor consignado es diferente al valor esperado: indique el motivo de la diferencia.';
    }
    return null;
}

async function canonDelContrato(cliente, contrato) {
    const res = await cliente.query('SELECT "rawCanon" FROM contratos WHERE contrato = $1', [contrato]);
    return Number(res.rows[0]?.rawCanon) || 0;
}

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
    const datos = { ...(req.body || {}) };
    if (!datos.arrendatario || !datos.contrato || !datos.fechaPago) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (*).' });
    }
    datos.numeroReciboCaja = textoLimpio(datos.numeroReciboCaja);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        // El canon del recibo NO se digita: se toma del contrato (solo se
        // cambia con una Renovación). Si el contrato todavía no tiene canon
        // registrado, se respeta el que venga.
        const canonContrato = await canonDelContrato(cliente, datos.contrato);
        if (canonContrato > 0) datos.canon = canonContrato;

        const errorDiferencia = validarDiferencia(datos);
        if (errorDiferencia) {
            await cliente.query('ROLLBACK');
            return res.status(400).json({ error: errorDiferencia });
        }

        if (datos.numeroReciboCaja) {
            const otro = await buscarReciboConNumero(cliente, datos.numeroReciboCaja, 0);
            if (otro) {
                await cliente.query('ROLLBACK');
                return res.status(409).json({ error: mensajeReciboDuplicado(datos.numeroReciboCaja, otro) });
            }
        }

        const valores = valoresPago(datos);
        const nombresColumnas = CAMPOS_PAGO.map((c) => `"${c}"`).join(', ');
        const marcadores = CAMPOS_PAGO.map((_, i) => `$${i + 1}`).join(', ');
        const resultado = await cliente.query(
            `INSERT INTO pagos (${nombresColumnas}) VALUES (${marcadores}) RETURNING *`,
            valores
        );
        await cliente.query('COMMIT');
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('Error creando recibo:', err);
        res.status(500).json({ error: 'No se pudo guardar el recibo.' });
    } finally {
        cliente.release();
    }
});

router.put('/:id', verificarToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de recibo inválido.' });
    }

    const datos = { ...(req.body || {}) };
    if (!datos.arrendatario || !datos.contrato || !datos.fechaPago) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (*).' });
    }
    datos.numeroReciboCaja = textoLimpio(datos.numeroReciboCaja);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const actualRes = await cliente.query('SELECT canon, "numeroReciboCaja" FROM pagos WHERE id = $1 FOR UPDATE', [id]);
        const actual = actualRes.rows[0];
        if (!actual) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({ error: 'Recibo no encontrado.' });
        }

        // El canon de un recibo ya guardado no se modifica. Solo si quedó en
        // $0 (ej. creado desde el Excel sin canon) se completa con el del
        // contrato, o con el que venga si el contrato tampoco lo tiene.
        const canonActual = Number(actual.canon) || 0;
        if (canonActual > 0) {
            datos.canon = canonActual;
        } else {
            const canonContrato = await canonDelContrato(cliente, datos.contrato);
            if (canonContrato > 0) datos.canon = canonContrato;
        }

        const errorDiferencia = validarDiferencia(datos);
        if (errorDiferencia) {
            await cliente.query('ROLLBACK');
            return res.status(400).json({ error: errorDiferencia });
        }

        // Solo se valida el número si CAMBIÓ: así se pueden seguir editando
        // recibos antiguos que ya venían con un número repetido del Excel.
        if (datos.numeroReciboCaja && datos.numeroReciboCaja !== textoLimpio(actual.numeroReciboCaja)) {
            const otro = await buscarReciboConNumero(cliente, datos.numeroReciboCaja, id);
            if (otro) {
                await cliente.query('ROLLBACK');
                return res.status(409).json({ error: mensajeReciboDuplicado(datos.numeroReciboCaja, otro) });
            }
        }

        const valores = valoresPago(datos);
        const asignaciones = CAMPOS_PAGO.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const resultado = await cliente.query(
            `UPDATE pagos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${CAMPOS_PAGO.length + 1} RETURNING *`,
            [...valores, id]
        );
        await cliente.query('COMMIT');
        res.json(resultado.rows[0]);
    } catch (err) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('Error actualizando recibo:', err);
        res.status(500).json({ error: 'No se pudo actualizar el recibo.' });
    } finally {
        cliente.release();
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
