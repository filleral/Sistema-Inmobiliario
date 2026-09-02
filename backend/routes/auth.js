// Login con usuario y clave COMPARTIDOS (uno solo para todo el negocio, no
// cuentas individuales). Las credenciales reales viven en variables de
// entorno (AUTH_USERNAME, AUTH_PASSWORD_HASH), nunca en el código.
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
    const { usuario, clave } = req.body || {};

    if (!usuario || !clave) {
        return res.status(400).json({ error: 'Escriba el usuario y la clave.' });
    }

    const usuarioValido = process.env.AUTH_USERNAME;
    const hashValido = process.env.AUTH_PASSWORD_HASH;

    if (!usuarioValido || !hashValido) {
        console.error('Faltan AUTH_USERNAME o AUTH_PASSWORD_HASH en las variables de entorno del backend.');
        return res.status(500).json({ error: 'El servidor no tiene configurado el acceso. Contacte al administrador.' });
    }

    const usuarioCoincide = usuario === usuarioValido;
    const claveCoincide = bcrypt.compareSync(clave, hashValido);

    if (!usuarioCoincide || !claveCoincide) {
        return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
    }

    const token = jwt.sign({ usuario }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
});

// Usado por el frontend al cargar la página, para saber si el token guardado
// sigue sirviendo o hay que mostrar la pantalla de inicio de sesión otra vez.
router.get('/verificar', verificarToken, (req, res) => {
    res.json({ ok: true, usuario: req.usuario.usuario });
});

module.exports = router;
