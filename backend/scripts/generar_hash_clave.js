// Utilidad de un solo uso: imprime el hash bcrypt de la clave que se vaya a
// usar para entrar a la app. Ese hash (NO la clave en texto plano) es el que
// se pega en la variable de entorno AUTH_PASSWORD_HASH de Render.
//
// Uso:  node scripts/generar_hash_clave.js "la-clave-que-elijas"
'use strict';

const bcrypt = require('bcryptjs');

const clave = process.argv[2];

if (!clave) {
    console.error('Uso: node scripts/generar_hash_clave.js "la-clave-que-elijas"');
    process.exit(1);
}

const hash = bcrypt.hashSync(clave, 10);
console.log('\nCopia este valor completo en la variable de entorno AUTH_PASSWORD_HASH de Render:\n');
console.log(hash);
console.log('');
