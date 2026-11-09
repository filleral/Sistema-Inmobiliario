// CRUD de contratos + "completar" (fusión sin sobrescribir ni duplicar).
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { CAMPOS_CONTRATO, valoresContrato, limpiarValorContrato } = require('../utils/campos');

const router = express.Router();

function estaVacio(valor) {
    return valor === null || valor === undefined || valor === '';
}

router.get('/', verificarToken, async (req, res) => {
    try {
        // El más reciente primero: "actualizadoEn" cambia tanto al crear un
        // contrato como al editarlo o registrar una renovación, así que el
        // último creado o renovado siempre queda arriba de la tabla.
        const resultado = await pool.query('SELECT * FROM contratos ORDER BY "actualizadoEn" DESC, id DESC');
        res.json(resultado.rows);
    } catch (err) {
        console.error('Error listando contratos:', err);
        res.status(500).json({ error: 'No se pudieron cargar los contratos.' });
    }
});

router.post('/', verificarToken, async (req, res) => {
    const datos = req.body || {};
    if (!datos.contrato || !datos.arrendatario || !datos.direccion) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (No. Contrato, Arrendatario, Dirección).' });
    }

    const valores = valoresContrato(datos);
    const nombresColumnas = CAMPOS_CONTRATO.map((c) => `"${c}"`).join(', ');
    const marcadores = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');

    try {
        const resultado = await pool.query(
            `INSERT INTO contratos (${nombresColumnas}) VALUES (${marcadores}) RETURNING *`,
            valores
        );
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: `Ya existe un contrato con el número ${datos.contrato}.` });
        }
        console.error('Error creando contrato:', err);
        res.status(500).json({ error: 'No se pudo guardar el contrato.' });
    }
});

// Fusión no destructiva: solo completa campos vacíos de contratos que ya
// existen (comparando por "contrato") y agrega los que no existan. Nunca
// sobrescribe un campo que ya tenga valor ni duplica contratos existentes.
router.post('/completar', verificarToken, async (req, res) => {
    const contratosImportados = Array.isArray(req.body?.contratos) ? req.body.contratos : [];
    if (contratosImportados.length === 0) {
        return res.status(400).json({ error: 'No se recibieron contratos para completar.' });
    }

    const cliente = await pool.connect();
    let camposCompletados = 0;
    let contratosActualizados = 0;
    let contratosAgregados = 0;

    try {
        await cliente.query('BEGIN');

        for (const imp of contratosImportados) {
            if (!imp || !imp.contrato) continue;

            const existenteRes = await cliente.query('SELECT * FROM contratos WHERE contrato = $1', [imp.contrato]);
            const existente = existenteRes.rows[0];

            if (existente) {
                const camposAActualizar = {};
                CAMPOS_CONTRATO.forEach((campo) => {
                    if (campo === 'item') return; // índice interno, no se completa
                    if (!(campo in imp)) return;   // el archivo no trae este campo: no tocar
                    const valorImportado = limpiarValorContrato(campo, imp[campo]);
                    if (estaVacio(existente[campo]) && !estaVacio(valorImportado)) {
                        camposAActualizar[campo] = valorImportado;
                    }
                });

                const camposLlenados = Object.keys(camposAActualizar);
                if (camposLlenados.length > 0) {
                    const asignaciones = camposLlenados.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
                    const valores = camposLlenados.map((c) => camposAActualizar[c]);
                    await cliente.query(
                        `UPDATE contratos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${camposLlenados.length + 1}`,
                        [...valores, existente.id]
                    );
                    camposCompletados += camposLlenados.length;
                    contratosActualizados++;
                }
            } else {
                const valores = valoresContrato(imp);
                const nombresColumnas = CAMPOS_CONTRATO.map((c) => `"${c}"`).join(', ');
                const marcadores = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');
                await cliente.query(
                    `INSERT INTO contratos (${nombresColumnas}) VALUES (${marcadores})`,
                    valores
                );
                contratosAgregados++;
            }
        }

        await cliente.query('COMMIT');
        res.json({ camposCompletados, contratosActualizados, contratosAgregados });
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('Error completando datos de contratos:', err);
        res.status(500).json({ error: 'No se pudo completar los datos. No se guardó ningún cambio.' });
    } finally {
        cliente.release();
    }
});

router.put('/:id', verificarToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de contrato inválido.' });
    }

    const datos = { ...(req.body || {}) };
    if (!datos.contrato || !datos.arrendatario || !datos.direccion) {
        return res.status(400).json({ error: 'Complete los campos obligatorios (No. Contrato, Arrendatario, Dirección).' });
    }

    try {
        // El canon de un contrato que ya lo tiene NO se edita directamente:
        // solo cambia con "Registrar Renovación" (que deja historial). Si el
        // contrato aún no tiene canon ($0), sí se permite registrarlo.
        const actualRes = await pool.query('SELECT canon, "rawCanon" FROM contratos WHERE id = $1', [id]);
        const actual = actualRes.rows[0];
        if (!actual) {
            return res.status(404).json({ error: 'Contrato no encontrado.' });
        }
        const canonActual = Number(actual.rawCanon) || 0;
        if (canonActual > 0) {
            const canonEnviado = Number(datos.rawCanon);
            if (datos.rawCanon !== undefined && Math.round(canonEnviado) !== Math.round(canonActual)) {
                return res.status(400).json({ error: 'El canon no se puede modificar desde la edición del contrato. Para cambiarlo use "Registrar Renovación".' });
            }
            datos.rawCanon = canonActual;
            datos.canon = actual.canon;
        }

        const valores = valoresContrato(datos);
        const asignaciones = CAMPOS_CONTRATO.map((c, i) => `"${c}" = $${i + 1}`).join(', ');

        const resultado = await pool.query(
            `UPDATE contratos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${CAMPOS_CONTRATO.length + 1} RETURNING *`,
            [...valores, id]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Contrato no encontrado.' });
        }
        res.json(resultado.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: `Ya existe otro contrato con el número ${datos.contrato}.` });
        }
        console.error('Error actualizando contrato:', err);
        res.status(500).json({ error: 'No se pudo actualizar el contrato.' });
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de contrato inválido.' });
    }

    try {
        const resultado = await pool.query('DELETE FROM contratos WHERE id = $1 RETURNING id', [id]);
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Contrato no encontrado.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error eliminando contrato:', err);
        res.status(500).json({ error: 'No se pudo eliminar el contrato.' });
    }
});

module.exports = router;
