// Lista de campos y valores por defecto de contratos y pagos, en UN solo
// lugar. Lo usan las rutas de contratos/pagos, respaldo, importar-csv y el
// script de migración, para no repetir (y desincronizar) la misma lógica en
// cuatro archivos distintos.
//
// Importante: cuando un campo llega "undefined" (no vino en el JSON), NO se
// debe insertar NULL a ciegas — varias columnas son NOT NULL (estado, ano,
// mes...) y pasar NULL explícito IGNORA el DEFAULT de la tabla y revienta
// la inserción. Por eso cada campo tiene un valor por defecto explícito acá,
// igual al que ya usa el formulario del frontend.
'use strict';

const CAMPOS_CONTRATO = [
    'item', 'contrato', 'estudio', 'sucursal', 'estado', 'arrendatario',
    'cedulaArr', 'celArr', 'correoArr',
    'codeudor', 'cedulaCodeudor', 'celCodeudor', 'correoCodeudor',
    'propietario', 'cedulaProp', 'celProp', 'correoProp',
    'titularConsignar', 'cedulaTitular', 'bancoProp', 'cuentaProp',
    'direccion', 'canon', 'rawCanon', 'diaLimite',
    'fechaIni', 'fechaVto', 'fechaAviso',
    'frecuenciaPago', 'fechaRenovacion', 'valorRenovacion', 'rawValorRenovacion',
];

const CAMPOS_FECHA_CONTRATO = ['fechaIni', 'fechaVto', 'fechaAviso', 'fechaRenovacion'];

const DEFECTOS_CONTRATO = {
    item: '',
    estudio: 'N/A',
    sucursal: '',
    estado: 'Activo',
    cedulaArr: '', celArr: '', correoArr: '',
    codeudor: '', cedulaCodeudor: '', celCodeudor: '', correoCodeudor: '',
    propietario: '', cedulaProp: '', celProp: '', correoProp: '',
    titularConsignar: '', cedulaTitular: '', bancoProp: '', cuentaProp: '',
    canon: '', rawCanon: 0,
    diaLimite: '5',
    frecuenciaPago: 'Mensual',
    valorRenovacion: '', rawValorRenovacion: 0,
};

const CAMPOS_PAGO = [
    'arrendatario', 'cedulaArr', 'propietario', 'cedulaProp',
    'titularConsignar', 'cedulaTitular', 'bancoProp', 'cuentaProp',
    'numeroFactura', 'numeroReciboCaja', 'numeroComprobanteEgreso',
    'fechaFactura', 'fechaPago', 'ano', 'mes', 'contrato',
    'direccion', 'formaPago', 'estadoArr', 'canon', 'conceptoDescArr',
    'descuento', 'totalConsignado', 'tipoLiquidacion', 'comision',
    'valor4x1000', 'conceptoDescProp', 'valorDescProp', 'netoPropietario',
    'fechaProp', 'formaProp', 'estadoProp', 'observaciones',
];

const CAMPOS_FECHA_PAGO = ['fechaFactura', 'fechaPago', 'fechaProp'];

const DEFECTOS_PAGO = {
    cedulaArr: '', propietario: '', cedulaProp: '',
    titularConsignar: '', cedulaTitular: '', bancoProp: '', cuentaProp: '',
    numeroFactura: '', numeroReciboCaja: '', numeroComprobanteEgreso: '',
    ano: '', mes: '',
    direccion: '',
    formaPago: 'AV VILLAS', estadoArr: 'CONFIRMADO',
    canon: 0, conceptoDescArr: '',
    descuento: 0, totalConsignado: 0, tipoLiquidacion: 'mensual', comision: 0,
    valor4x1000: 0, conceptoDescProp: '', valorDescProp: 0, netoPropietario: 0,
    formaProp: 'AV VILLAS', estadoProp: 'CONFIRMADO', observaciones: '',
};

const CAMPOS_RENOVACION = [
    'contrato', 'fechaRenovacion', 'canonAnterior', 'canonNuevo',
    'nuevaFechaVto', 'observaciones',
];

const CAMPOS_FECHA_RENOVACION = ['fechaRenovacion', 'nuevaFechaVto'];

const DEFECTOS_RENOVACION = {
    canonAnterior: 0, canonNuevo: 0, observaciones: '',
};

function limpiarUno(campo, valor, camposFecha, defectos) {
    if (camposFecha.includes(campo)) {
        return (valor === '' || valor === undefined || valor === null) ? null : valor;
    }
    if (valor === undefined || valor === null) {
        return Object.prototype.hasOwnProperty.call(defectos, campo) ? defectos[campo] : '';
    }
    return valor;
}

// Devuelve los valores de un contrato/pago, YA normalizados, en el mismo
// orden que CAMPOS_CONTRATO/CAMPOS_PAGO (listos para pasar como parámetros
// de una consulta SQL parametrizada).
function valoresContrato(datosCrudos) {
    const datos = datosCrudos || {};
    return CAMPOS_CONTRATO.map((campo) => limpiarUno(campo, datos[campo], CAMPOS_FECHA_CONTRATO, DEFECTOS_CONTRATO));
}

function valoresPago(datosCrudos) {
    const datos = datosCrudos || {};
    return CAMPOS_PAGO.map((campo) => limpiarUno(campo, datos[campo], CAMPOS_FECHA_PAGO, DEFECTOS_PAGO));
}

function valoresRenovacion(datosCrudos) {
    const datos = datosCrudos || {};
    return CAMPOS_RENOVACION.map((campo) => limpiarUno(campo, datos[campo], CAMPOS_FECHA_RENOVACION, DEFECTOS_RENOVACION));
}

// Variante para UPDATE parcial (solo los campos que se le pasen, tal cual
// vienen — usado por "completar", que ya decide cuáles campos tocar).
function limpiarValorContrato(campo, valor) {
    return limpiarUno(campo, valor, CAMPOS_FECHA_CONTRATO, DEFECTOS_CONTRATO);
}

module.exports = {
    CAMPOS_CONTRATO,
    CAMPOS_PAGO,
    CAMPOS_RENOVACION,
    valoresContrato,
    valoresPago,
    valoresRenovacion,
    limpiarValorContrato,
};
