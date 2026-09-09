-- Esquema de la base de datos del Sistema Inmobiliario (Bienes Raíces White).
-- Se corre UNA sola vez, en el editor SQL de Neon (o con psql), antes de
-- desplegar el backend o correr la migración.
--
-- Los nombres de columna usan camelCase entre comillas dobles, IGUALES a los
-- nombres de campo que ya usa app.js, para que las respuestas de la API se
-- puedan usar tal cual en el frontend sin traducir nombres.

CREATE TABLE IF NOT EXISTS contratos (
    id SERIAL PRIMARY KEY,
    item TEXT,
    contrato TEXT NOT NULL UNIQUE,
    estudio TEXT DEFAULT 'N/A',
    sucursal TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'Activo',
    arrendatario TEXT NOT NULL,
    "cedulaArr" TEXT DEFAULT '',
    "celArr" TEXT DEFAULT '',
    "correoArr" TEXT DEFAULT '',
    codeudor TEXT DEFAULT '',
    "cedulaCodeudor" TEXT DEFAULT '',
    "celCodeudor" TEXT DEFAULT '',
    "correoCodeudor" TEXT DEFAULT '',
    propietario TEXT DEFAULT '',
    "cedulaProp" TEXT DEFAULT '',
    "celProp" TEXT DEFAULT '',
    "correoProp" TEXT DEFAULT '',
    "titularConsignar" TEXT DEFAULT '',
    "cedulaTitular" TEXT DEFAULT '',
    "bancoProp" TEXT DEFAULT '',
    "cuentaProp" TEXT DEFAULT '',
    direccion TEXT NOT NULL,
    canon TEXT DEFAULT '',                          -- string formateado "$ 1.000.000", tal cual lo arma el frontend
    "rawCanon" NUMERIC(14, 2) DEFAULT 0,
    "diaLimite" TEXT DEFAULT '5',
    "fechaIni" DATE,
    "fechaVto" DATE,
    "fechaAviso" DATE,
    "frecuenciaPago" TEXT DEFAULT 'Mensual',
    "fechaRenovacion" DATE,
    "valorRenovacion" TEXT DEFAULT '',
    "rawValorRenovacion" NUMERIC(14, 2) DEFAULT 0,
    "creadoEn" TIMESTAMPTZ DEFAULT now(),
    "actualizadoEn" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_contrato ON contratos (contrato);
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos (estado);

CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    arrendatario TEXT NOT NULL,
    "cedulaArr" TEXT DEFAULT '',
    propietario TEXT DEFAULT '',
    "cedulaProp" TEXT DEFAULT '',
    "titularConsignar" TEXT DEFAULT '',
    "cedulaTitular" TEXT DEFAULT '',
    "bancoProp" TEXT DEFAULT '',
    "cuentaProp" TEXT DEFAULT '',
    "numeroFactura" TEXT DEFAULT '',
    "fechaFactura" DATE,
    "fechaPago" DATE NOT NULL,
    ano TEXT NOT NULL,
    mes TEXT NOT NULL,
    -- FK LÓGICA hacia contratos.contrato, SIN constraint físico a propósito:
    -- hoy la app permite eliminar un contrato sin revisar sus pagos (deja
    -- huérfanos), y el histórico real trae varios pagos legítimos para el
    -- mismo contrato+mes+año (pagos parciales/correcciones). Una FK física
    -- bloquearía eso o forzaría ON DELETE CASCADE, que borraría historial
    -- de pagos sin avisar.
    contrato TEXT NOT NULL,
    direccion TEXT DEFAULT '',
    "formaPago" TEXT DEFAULT 'AV VILLAS',
    "estadoArr" TEXT DEFAULT 'CONFIRMADO',
    canon NUMERIC(14, 2) DEFAULT 0,
    "conceptoDescArr" TEXT DEFAULT '',
    descuento NUMERIC(14, 2) DEFAULT 0,
    "totalConsignado" NUMERIC(14, 2) DEFAULT 0,
    "tipoLiquidacion" TEXT DEFAULT 'mensual',
    comision NUMERIC(14, 2) DEFAULT 0,
    "valor4x1000" NUMERIC(14, 2) DEFAULT 0,
    "conceptoDescProp" TEXT DEFAULT '',
    "valorDescProp" NUMERIC(14, 2) DEFAULT 0,
    "netoPropietario" NUMERIC(14, 2) DEFAULT 0,
    "fechaProp" DATE,
    "formaProp" TEXT DEFAULT 'AV VILLAS',
    "estadoProp" TEXT DEFAULT 'CONFIRMADO',
    observaciones TEXT DEFAULT '',
    "creadoEn" TIMESTAMPTZ DEFAULT now(),
    "actualizadoEn" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_contrato ON pagos (contrato);
CREATE INDEX IF NOT EXISTS idx_pagos_mes_ano ON pagos (mes, ano);
CREATE INDEX IF NOT EXISTS idx_pagos_arrendatario ON pagos (arrendatario);

-- Historial de renovaciones: un registro permanente por cada vez que un
-- contrato se renueva (antes solo se guardaba un dato suelto de "próxima
-- renovación" en el contrato, que se perdía al editarlo). Sin FK física
-- hacia contratos, por la misma razón que "pagos": no bloquear ni borrar
-- historial si el contrato se elimina.
CREATE TABLE IF NOT EXISTS renovaciones (
    id SERIAL PRIMARY KEY,
    contrato TEXT NOT NULL,
    "fechaRenovacion" DATE NOT NULL,
    "canonAnterior" NUMERIC(14, 2) DEFAULT 0,
    "canonNuevo" NUMERIC(14, 2) DEFAULT 0,
    "nuevaFechaVto" DATE,
    observaciones TEXT DEFAULT '',
    "creadoEn" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renovaciones_contrato ON renovaciones (contrato);
