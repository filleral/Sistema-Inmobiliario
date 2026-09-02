// Middleware que protege las rutas: exige un JWT válido en el header
// "Authorization: Bearer <token>". Se usa en todas las rutas de datos
// (contratos, pagos, respaldo) — el login y /health quedan públicos.
'use strict';

const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const encabezado = req.headers.authorization || '';
    const [tipo, token] = encabezado.split(' ');

    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Falta iniciar sesión.' });
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'La sesión expiró o no es válida. Vuelve a iniciar sesión.' });
    }
}

module.exports = { verificarToken };
