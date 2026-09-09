// Sincronización automática desde el Excel de Google Sheets (pestañas
// "Inmuebles" y "BD 2026"). Lo llama un script de Google Apps Script que
// vive dentro del propio Excel, cada 5 minutos, con la clave de
// backend/middleware/syncSecret.js (no con usuario/clave de una persona).
//
// Reglas importantes (decididas con el cliente):
//  - NUNCA se elimina ni se vacía nada. Si una celda del Excel viene vacía,
//    ese campo simplemente NO se toca en la web (se deja lo que ya había).
//    Solo se escribe cuando el Excel sí trae un valor.
//  - "Inmuebles" -> contratos: contrato/estudio/cédula/arrendatario/estado/
//    sucursal/día límite se actualizan con lo que traiga el Excel (cuando
//    no venga vacío). Nunca toca propietario, banco, canon, fechas del
//    contrato, celular, correo, etc. — esos solo se editan desde la web.
//  - "BD 2026" -> pagos (recibos): se empareja por contrato+mes+año (igual
//    que ya hace la propia app al detectar un recibo existente). Trae
//    también los valores reales (canon, total consignado, forma/fecha de
//    pago, estado, propietario, número de factura) cuando el Excel los
//    trae. Si el recibo no existe todavía, se crea con lo que haya (y
//    "PENDIENTE" si el Excel no trae estado) para que quede visible.
'use strict';

const express = require('express');
const pool = require('../db');
const { verificarSecretoSync } = require('../middleware/syncSecret');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, valoresContrato, valoresPago } = require('../utils/campos');

const router = express.Router();

function textoOVacio(v) {
    return (v === undefined || v === null) ? '' : String(v).trim();
}

// El script de Google Sheets ya manda estos valores como número JSON limpio
// (lee el valor numérico real de la celda, no el texto con puntos/comas que
// se ve en pantalla), así que acá solo se valida — no hace falta parsear
// formato colombiano de nuevo.
function numeroOVacio(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// Arma el objeto de campos a actualizar tomando SOLO las claves de
// "posibles" cuyo valor no sea vacío/null — así una celda en blanco del
// Excel nunca borra un dato que ya existía en la web.
function soloConValor(posibles) {
    const resultado = {};
    Object.keys(posibles).forEach((campo) => {
        const v = posibles[campo];
        if (v !== '' && v !== null && v !== undefined) resultado[campo] = v;
    });
    return resultado;
}

async function actualizarOInsertar(cliente, tabla, camposTabla, valoresFn, existenteId, camposDirectos, datosCompletosNuevo) {
    if (existenteId) {
        const nombresCampos = Object.keys(camposDirectos);
        if (nombresCampos.length === 0) return 'sinCambios';
        const asignaciones = nombresCampos.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const valores = nombresCampos.map((c) => camposDirectos[c]);
        await cliente.query(
            `UPDATE ${tabla} SET ${asignaciones}, "actualizadoEn" = now() WHERE id = $${nombresCampos.length + 1}`,
            [...valores, existenteId]
        );
        return 'actualizado';
    }
    const valores = valoresFn(datosCompletosNuevo);
    const nombresColumnas = camposTabla.map((c) => `"${c}"`).join(', ');
    const marcadores = camposTabla.map((_, i) => `$${i + 1}`).join(', ');
    await cliente.query(`INSERT INTO ${tabla} (${nombresColumnas}) VALUES (${marcadores}) ON CONFLICT DO NOTHING`, valores);
    return 'agregado';
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
            const camposDirectos = soloConValor({
                estudio: textoOVacio(fila.estudio),
                cedulaArr: textoOVacio(fila.cedulaArr),
                arrendatario,
                celArr: textoOVacio(fila.celArr),
                correoArr: textoOVacio(fila.correoArr),
                cedulaCodeudor: textoOVacio(fila.cedulaCodeudor),
                codeudor: textoOVacio(fila.codeudor),
                celCodeudor: textoOVacio(fila.celCodeudor),
                correoCodeudor: textoOVacio(fila.correoCodeudor),
                estado: textoOVacio(fila.estado),
                sucursal: textoOVacio(fila.sucursal),
                cedulaProp: textoOVacio(fila.cedulaProp),
                propietario: textoOVacio(fila.propietario),
                celProp: textoOVacio(fila.celProp),
                correoProp: textoOVacio(fila.correoProp),
                direccion: textoOVacio(fila.direccion),
                titularConsignar: textoOVacio(fila.titularConsignar),
                cuentaProp: textoOVacio(fila.cuentaProp),
                bancoProp: textoOVacio(fila.bancoProp),
                cedulaTitular: textoOVacio(fila.cedulaTitular),
                frecuenciaPago: textoOVacio(fila.frecuenciaPago),
                fechaIni: textoOVacio(fila.fechaIni) || null,
                fechaVto: textoOVacio(fila.fechaVto) || null,
                diaLimite: textoOVacio(fila.diaLimite),
                fechaAviso: textoOVacio(fila.fechaAviso) || null,
                canon: textoOVacio(fila.canon),
                rawCanon: numeroOVacio(fila.rawCanon),
            });

            const resultado = await actualizarOInsertar(
                cliente, 'contratos', CAMPOS_CONTRATO, valoresContrato,
                existenteRes.rows[0]?.id, camposDirectos,
                { contrato, direccion: 'SIN DIRECCIÓN (pendiente completar)', estado: 'Activo', ...camposDirectos }
            );
            if (resultado === 'actualizado') resumen.contratosActualizados++;
            else if (resultado === 'agregado') resumen.contratosAgregados++;
        }

        // ---- Pestaña "BD 2026" -> pagos (recibos) ----
        for (const fila of pagosSync) {
            const contrato = textoOVacio(fila.contrato);
            const mes = textoOVacio(fila.mes);
            const ano = textoOVacio(fila.ano);
            if (!contrato || !mes || !ano) { resumen.filasOmitidas++; continue; }

            const sucursal = textoOVacio(fila.sucursal);
            const diaLimite = textoOVacio(fila.diaLimite);
            const direccionPredio = textoOVacio(fila.direccionPredio);
            // "BD 2026" también puede traer Sucursal/Día Límite/Dirección del
            // Predio, que en realidad son datos del CONTRATO (se reflejan
            // ahí, igual que hace "Inmuebles"), no del recibo puntual.
            if (sucursal || diaLimite || direccionPredio) {
                const camposContrato = soloConValor({ sucursal, diaLimite });
                if (direccionPredio) {
                    // La dirección "de verdad" viene de "Inmuebles"; esta solo
                    // completa cuando el contrato todavía no tiene ninguna
                    // (vacía o el marcador de "pendiente completar" que deja
                    // un contrato creado solo desde este mismo sync).
                    const actualRes = await cliente.query('SELECT direccion FROM contratos WHERE contrato = $1', [contrato]);
                    const direccionActual = actualRes.rows[0]?.direccion || '';
                    if (!direccionActual || direccionActual === 'SIN DIRECCIÓN (pendiente completar)') {
                        camposContrato.direccion = direccionPredio;
                    }
                }
                if (Object.keys(camposContrato).length > 0) {
                    const nombresCampos = Object.keys(camposContrato);
                    const asignaciones = nombresCampos.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
                    const valores = nombresCampos.map((c) => camposContrato[c]);
                    await cliente.query(
                        `UPDATE contratos SET ${asignaciones}, "actualizadoEn" = now() WHERE contrato = $${nombresCampos.length + 1}`,
                        [...valores, contrato]
                    );
                }
            }

            const arrendatario = textoOVacio(fila.arrendatario);

            // El script de Google Sheets ya normaliza estadoArr/estadoProp a
            // "CONFIRMADO"/"PENDIENTE"/"" (vacío si el texto no se reconoce),
            // así que acá solo se usa tal cual — nunca se fuerza un estado
            // cuando el Excel trae algo que no se entendió.
            const camposDirectos = soloConValor({
                arrendatario,
                cedulaArr: textoOVacio(fila.cedulaArr),
                tipoLiquidacion: textoOVacio(fila.tipoLiquidacion).toLowerCase(),
                fechaFactura: textoOVacio(fila.fechaFactura) || null,
                numeroFactura: textoOVacio(fila.numeroFactura),
                numeroReciboCaja: textoOVacio(fila.numeroReciboCaja),
                canon: numeroOVacio(fila.canon),
                totalConsignado: numeroOVacio(fila.totalConsignado),
                formaPago: textoOVacio(fila.formaPago),
                fechaPago: textoOVacio(fila.fechaPago) || null,
                estadoArr: textoOVacio(fila.estadoArr),
                propietario: textoOVacio(fila.propietario),
                cedulaProp: textoOVacio(fila.cedulaProp),
                titularConsignar: textoOVacio(fila.titularConsignar),
                cedulaTitular: textoOVacio(fila.cedulaTitular),
                bancoProp: textoOVacio(fila.bancoProp),
                cuentaProp: textoOVacio(fila.cuentaProp),
                netoPropietario: numeroOVacio(fila.netoPropietario),
                formaProp: textoOVacio(fila.formaProp),
                fechaProp: textoOVacio(fila.fechaProp) || null,
                estadoProp: textoOVacio(fila.estadoProp),
            });

            const existenteRes = await cliente.query(
                'SELECT id FROM pagos WHERE contrato = $1 AND mes = $2 AND ano = $3 ORDER BY id LIMIT 1',
                [contrato, mes, ano]
            );

            if (!existenteRes.rows[0] && !arrendatario) { resumen.filasOmitidas++; continue; } // arrendatario es NOT NULL al crear

            // fechaPago es obligatoria en la tabla; si el Excel todavía no
            // trae la fecha real de pago, se usa la de factura, o el 1 del
            // mes/año como último recurso, mientras se registra el pago real.
            const fechaPagoParaCrear = camposDirectos.fechaPago || camposDirectos.fechaFactura || `${ano}-01-01`;

            const resultado = await actualizarOInsertar(
                cliente, 'pagos', CAMPOS_PAGO, valoresPago,
                existenteRes.rows[0]?.id, camposDirectos,
                {
                    contrato, mes, ano, arrendatario,
                    estadoArr: camposDirectos.estadoArr || 'PENDIENTE',
                    fechaPago: fechaPagoParaCrear,
                    observaciones: 'Creado automáticamente desde el Excel (BD 2026).',
                    ...camposDirectos,
                }
            );
            if (resultado === 'actualizado') resumen.pagosActualizados++;
            else if (resultado === 'agregado') resumen.pagosAgregados++;
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
