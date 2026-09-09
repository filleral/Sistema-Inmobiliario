// Servidor Express: API del Sistema Inmobiliario (Bienes Raíces White).
// Reemplaza el localStorage del navegador por PostgreSQL, para que los datos
// no se pierdan y sean los mismos vistos desde cualquier equipo.
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const rutasAuth = require('./routes/auth');
const rutasContratos = require('./routes/contratos');
const rutasPagos = require('./routes/pagos');
const rutasRespaldo = require('./routes/respaldo');
const rutasImportar = require('./routes/importar');
const rutasSync = require('./routes/sync');
const rutasRenovaciones = require('./routes/renovaciones');

const app = express();
const PUERTO = process.env.PORT || 3000;

// Orígenes permitidos (separados por coma en la variable de entorno). Por
// defecto, el sitio de GitHub Pages de la app.
const origenesPermitidos = (process.env.ALLOWED_ORIGIN || 'https://filleral.github.io')
    .split(',')
    .map((o) => o.trim());

app.use(cors({
    origin(origen, callback) {
        // Permite peticiones sin header Origin (ej. curl, health checks).
        if (!origen || origenesPermitidos.includes(origen)) {
            return callback(null, true);
        }
        callback(new Error('Origen no permitido por CORS'));
    },
}));
app.use(express.json({ limit: '5mb' })); // límite generoso: respaldo/restaurar mueve el histórico completo

// Health check público, lo usa Render para saber si el servicio sigue vivo.
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true });
    } catch (err) {
        console.error('Health check falló (sin conexión a la base de datos):', err.message);
        res.status(503).json({ ok: false, error: 'Sin conexión a la base de datos.' });
    }
});

app.use('/api/auth', rutasAuth);
app.use('/api/contratos', rutasContratos);
app.use('/api/pagos', rutasPagos);
app.use('/api/respaldo', rutasRespaldo);
app.use('/api/importar-csv', rutasImportar);
app.use('/api/sync', rutasSync);
app.use('/api/renovaciones', rutasRenovaciones);

// Manejador de errores genérico (por ejemplo, el error de CORS de arriba).
app.use((err, req, res, next) => {
    console.error('Error no controlado:', err.message);
    res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

app.listen(PUERTO, () => {
    console.log(`API de Bienes Raíces White escuchando en el puerto ${PUERTO}`);
});
