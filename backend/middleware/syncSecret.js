// Middleware que protege el endpoint de sincronización con Google Sheets.
// No usa JWT (eso es para personas iniciando sesión): el script de Google
// Apps Script que corre dentro del Excel no "inicia sesión", así que usa una
// clave secreta larga y fija (SYNC_SECRET) que solo conocen el backend y ese
// script, enviada en el header "X-Sync-Secret".
'use strict';

function verificarSecretoSync(req, res, next) {
    const secretoEsperado = process.env.SYNC_SECRET;
    const secretoRecibido = req.headers['x-sync-secret'];

    if (!secretoEsperado) {
        console.error('SYNC_SECRET no está configurado en el servidor; el endpoint de sincronización queda bloqueado.');
        return res.status(503).json({ error: 'La sincronización con Excel no está configurada en el servidor.' });
    }
    if (!secretoRecibido || secretoRecibido !== secretoEsperado) {
        return res.status(401).json({ error: 'Clave de sincronización inválida.' });
    }
    next();
}

module.exports = { verificarSecretoSync };
