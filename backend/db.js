// Conexión a PostgreSQL (Neon). Se usa un único Pool compartido por toda la app.
'use strict';

const { Pool, types } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('Falta la variable de entorno DATABASE_URL. Revisa el archivo .env (local) o las variables de entorno de Render.');
}

// El driver "pg", por defecto, convierte las columnas DATE en objetos Date
// de JS (se serializan como "2026-01-01T00:00:00.000Z") y las columnas
// NUMERIC en texto (para no perder precisión con floats). El frontend
// espera fechas simples "AAAA-MM-DD" (para los <input type="date">) y
// números reales (para sumar/restar directamente). Se ajustan los parsers
// de tipo para que la API entregue exactamente lo que la app ya espera.
types.setTypeParser(1082, (valor) => valor); // 1082 = OID de "date": deja el texto tal cual, sin convertir a Date
types.setTypeParser(1700, (valor) => (valor === null ? null : parseFloat(valor))); // 1700 = OID de "numeric"

// Neon exige SSL. rejectUnauthorized:false evita problemas si la cadena de
// certificados del proveedor no está en la lista de confianza del entorno
// donde corre el backend (Render sí las trae, pero se deja como respaldo).
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
    // Errores de conexiones ociosas en el pool no deben tumbar el proceso.
    console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;
