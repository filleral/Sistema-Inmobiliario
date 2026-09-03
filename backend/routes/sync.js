// Sincronización automática desde el Excel de Google Sheets (pestañas
// "Inmuebles" y "BD 2026"). Lo llama un script de Google Apps Script que
// vive dentro del propio Excel, cada 5 minutos, con la clave de
// backend/middleware/syncSecret.js (no con usuario/clave de una persona).
//
// Reglas importantes (decididas con el cliente):
//  - "Inmuebles" -> contratos: SIEMPRE actualiza contrato/estudio/cédula/
//    arrendatario/estado con lo que diga el Excel (el Excel manda en esos
//    campos). NUNCA toca propietario, banco, canon, fechas, celular,
//    correo, etc. — esos solo se editan desde la web.
//  - "BD 2026" -> pagos (recibos): se empareja por contrato+mes+año (igual
//    que ya hace la propia app al detectar un recibo existente). Si el
//    recibo ya existe, SOLO actualiza tipo de liquidación, fecha de
//    factura, cédula y nombre del arrendatario — NUNCA toca canon, total,
//    comisión, neto ni los estados de pago (eso lo escribe Clara desde la
//    web con los valores reales). Si el recibo no existe todavía, se crea
//    en $0 con estado "PENDIENTE" para que quede visible y alguien lo
//    complete con el valor real.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarSecretoSync } = require('../middleware/syncSecret');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, valoresContrato, valoresPago } = require('../utils/campos');

const router = express.Router();

function textoOVacio(v) {
    return (v === undefined || v === null) ? '' : String(v).trim();
}

router.post('/excel', verificarSecretoSync, async (req, res) => {
    const inmuebles = Array.isArray(req.body?.inmuebles) ? req.body.inmuebles : [];
    const pagosSync = Array.isArray(req.body?.pagos) ? req.body.pagos : [];

    const resumen = {
        contratosActualizados: 0,
        contratosAgregados: 0,
        pagosActualizados: 0,
        pagosAgregados: 0,
        filasOmitidas: 0,
    };

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        // ---- Pestaña "Inmuebles" -> contratos ----
        for (const fila of inmuebles) {
            const contrato = textoOVacio(fila.contrato);
            const arrendatario = textoOVacio(fila.arrendatario);
            if (!contrato || !arrendatario) { resumen.filasOmitidas++; continue; }

            const existenteRes = await cliente.query('SELECT id FROM contratos WHERE contrato = $1', [contrato]);
            const camposDirectos = {
                estudio: textoOVacio(fila.estudio),
                cedulaArr: textoOVacio(fila.cedulaArr),
                arrendatario,
                estado: textoOVacio(fila.estado) || 'Activo',
            };
            if (textoOVacio(fila.sucursal)) camposDirectos.sucursal = textoOVacio(fila.sucursal);

            if (existenteRes.rows[0]) {
                const nombresCampos = Object.keys(camposDirectos);
                const asignaciones = nombresCampos.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
                const valores = nombresCampos.map((c) => camposDirectos[c]);
                await cliente.query(
                    `UPDATE contratos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${nombresCampos.length + 1}`,
                    [...valores, existenteRes.rows[0].id]
                );
                resumen.contratosActualizados++;
            } else {
                const datosNuevos = { contrato, direccion: 'SIN DIRECCIÓN (pendiente completar)', ...camposDirectos };
                const valores = valoresContrato(datosNuevos);
                const nombresColumnas = CAMPOS_CONTRATO.map((c) => `"${c}"`).join(', ');
                const marcadores = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');
                await cliente.query(`INSERT INTO contratos (${nombresColumnas}) VALUES (${marcadores}) ON CONFLICT (contrato) DO NOTHING`, valores);
                resumen.contratosAgregados++;
            }
        }

        // ---- Pestaña "BD 2026" -> pagos (recibos) ----
        for (const fila of pagosSync) {
            const contrato = textoOVacio(fila.contrato);
            const mes = textoOVacio(fila.mes);
            const ano = textoOVacio(fila.ano);
            if (!contrato || !mes || !ano) { resumen.filasOmitidas++; continue; }

            const arrendatario = textoOVacio(fila.arrendatario);
            const cedulaArr = textoOVacio(fila.cedulaArr);
            const tipoLiquidacion = textoOVacio(fila.tipoLiquidacion).toLowerCase();
            const fechaFactura = textoOVacio(fila.fechaFactura) || null;
            const sucursal = textoOVacio(fila.sucursal);

            // "BD 2026" es la única de las dos pestañas que trae la Sucursal,
            // así que de paso se refleja en el contrato (columna que sí lee
            // "Inmuebles" en pantalla y en los recibos).
            if (sucursal) {
                await cliente.query(
                    'UPDATE contratos SET sucursal = $1, "actualizadoEn" = now() WHERE contrato = $2',
                    [sucursal, contrato]
                );
            }

            const existenteRes = await cliente.query(
                'SELECT id FROM pagos WHERE contrato = $1 AND mes = $2 AND ano = $3 ORDER BY id LIMIT 1',
                [contrato, mes, ano]
            );

            const camposDirectos = { tipoLiquidacion: tipoLiquidacion || 'mensual', "fechaFactura": fechaFactura };
            if (arrendatario) camposDirectos.arrendatario = arrendatario;
            if (cedulaArr) camposDirectos.cedulaArr = cedulaArr;

            if (existenteRes.rows[0]) {
                const nombresCampos = Object.keys(camposDirectos);
                const asignaciones = nombresCampos.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
                const valores = nombresCampos.map((c) => camposDirectos[c]);
                await cliente.query(
                    `UPDATE pagos SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${nombresCampos.length + 1}`,
                    [...valores, existenteRes.rows[0].id]
                );
                resumen.pagosActualizados++;
            } else {
                if (!arrendatario) { resumen.filasOmitidas++; continue; } // arrendatario es NOT NULL
                // fechaPago es obligatoria; usamos la fecha de factura como
                // aproximación, o el 1 del mes/año si tampoco vino, ya que
                // el pago real todavía no se ha registrado.
                const fechaPagoAprox = fechaFactura || `${ano}-01-01`;
                const datosNuevos = {
                    arrendatario, cedulaArr, contrato, mes, ano,
                    fechaFactura, fechaPago: fechaPagoAprox,
                    tipoLiquidacion: tipoLiquidacion || 'mensual',
                    estadoArr: 'PENDIENTE',
                    observaciones: 'Creado automáticamente desde el Excel (BD 2026); falta completar el valor real.',
                };
                const valores = valoresPago(datosNuevos);
                const nombresColumnas = CAMPOS_PAGO.map((c) => `"${c}"`).join(', ');
                const marcadores = CAMPOS_PAGO.map((_, i) => `$${i + 1}`).join(', ');
                await cliente.query(`INSERT INTO pagos (${nombresColumnas}) VALUES (${marcadores})`, valores);
                resumen.pagosAgregados++;
            }
        }

        await cliente.query('COMMIT');
        res.json(resumen);
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('Error sincronizando desde Excel:', err);
        res.status(500).json({ error: 'No se pudo sincronizar. No se guardó ningún cambio de esta corrida.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
