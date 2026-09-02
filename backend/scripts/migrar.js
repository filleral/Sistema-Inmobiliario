// Migración de un solo uso: carga el contenido de Respaldo_desde_Excel.json
// (o el archivo que se le indique) a las tablas contratos/pagos de Postgres.
//
// Uso:
//   node scripts/migrar.js                          -> usa ../../Respaldo_desde_Excel.json
//   node scripts/migrar.js ruta\a\otro\respaldo.json -> usa ese archivo
//   node scripts/migrar.js --truncate                -> vacía las tablas antes de insertar
//                                                        (necesario para poder repetir la
//                                                        migración sin duplicar todo)
//
// Requiere que backend/.env tenga DATABASE_URL apuntando a la base de datos
// real (Neon). Este script se corre a mano, UNA vez; nunca se expone como
// endpoint HTTP.
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { CAMPOS_CONTRATO, CAMPOS_PAGO, valoresContrato, valoresPago } = require('../utils/campos');

const argumentos = process.argv.slice(2);
const debeTruncar = argumentos.includes('--truncate');
const rutaArchivo = argumentos.find((a) => !a.startsWith('--'))
    || path.join(__dirname, '..', '..', 'Respaldo_desde_Excel.json');

async function migrar() {
    console.log(`Leyendo: ${rutaArchivo}`);
    if (!fs.existsSync(rutaArchivo)) {
        console.error('No se encontró el archivo. Verifica la ruta.');
        process.exit(1);
    }

    const contenido = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
    const contratos = contenido?.datos?.brw_datosBase;
    const pagos = contenido?.datos?.brw_datosPagos_v10;

    if (!Array.isArray(contratos) || !Array.isArray(pagos)) {
        console.error('El archivo no tiene la estructura esperada (datos.brw_datosBase / datos.brw_datosPagos_v10).');
        process.exit(1);
    }

    console.log(`Contratos en el archivo: ${contratos.length}`);
    console.log(`Pagos en el archivo: ${pagos.length}`);

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        if (debeTruncar) {
            console.log('Vaciando las tablas contratos y pagos antes de insertar (--truncate)...');
            await cliente.query('TRUNCATE contratos RESTART IDENTITY');
            await cliente.query('TRUNCATE pagos RESTART IDENTITY');
        }

        let contratosInsertados = 0;
        for (const c of contratos) {
            const valores = valoresContrato(c);
            const nombresColumnas = CAMPOS_CONTRATO.map((campo) => `"${campo}"`).join(', ');
            const marcadores = CAMPOS_CONTRATO.map((_, i) => `$${i + 1}`).join(', ');
            await cliente.query(`INSERT INTO contratos (${nombresColumnas}) VALUES (${marcadores})`, valores);
            contratosInsertados++;
        }

        let pagosInsertados = 0;
        for (const p of pagos) {
            const valores = valoresPago(p);
            const nombresColumnas = CAMPOS_PAGO.map((campo) => `"${campo}"`).join(', ');
            const marcadores = CAMPOS_PAGO.map((_, i) => `$${i + 1}`).join(', ');
            await cliente.query(`INSERT INTO pagos (${nombresColumnas}) VALUES (${marcadores})`, valores);
            pagosInsertados++;
        }

        await cliente.query('COMMIT');
        console.log('\n¡Migración completada!');
        console.log(`  Contratos insertados: ${contratosInsertados}`);
        console.log(`  Pagos insertados: ${pagosInsertados}`);
    } catch (err) {
        await cliente.query('ROLLBACK');
        console.error('\nLa migración falló, no se insertó nada (se revirtió todo):');
        console.error(err.message);
        if (!debeTruncar) {
            console.error('\nSugerencia: si ya habías corrido este script antes, vuelve a intentarlo con --truncate.');
        }
        process.exit(1);
    } finally {
        cliente.release();
        await pool.end();
    }
}

migrar();
