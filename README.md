# Sistema Inmobiliario - Grupo Empresarial Bienes Raíces White

Sistema de gestión de arriendos (contratos, recibos de caja y liquidaciones
a propietarios) para una sola inmobiliaria. Es una página web autocontenida
(`index.html`, con HTML + CSS + JavaScript en un solo archivo) que guarda
toda la información en el **localStorage del navegador** — no usa servidor
ni base de datos externa.

## Cómo usarlo

1. Abra `index.html` en el navegador (doble clic, o publicado en GitHub Pages).
2. Pestaña **Gestión de Contratos**: registre cada contrato de arriendo
   (arrendatario, inmueble, propietario, canon, día límite de pago).
3. Pestaña **Recibos de Caja y Consignaciones**: registre cada pago recibido
   del arrendatario y la liquidación calculada para el propietario
   (comisión de administración 10%, GMF/4x1000 opcional, neto a consignar).
4. Los botones **Exportar CSV** de cada pestaña generan un reporte en Excel/CSV.

Todos los datos quedan guardados automáticamente en el navegador donde se
usa la aplicación. Si cambia de computador o de navegador, use un respaldo
para llevarse la información (ver abajo).

## Respaldar y restaurar datos

En la barra superior:

- **Respaldar Todo**: descarga un archivo `.json` con fecha en el nombre
  que contiene toda la información del sistema (contratos y recibos).
  Guarde este archivo periódicamente en un lugar seguro.
- **Restaurar Respaldo**: permite seleccionar un archivo `.json` generado
  previamente con "Respaldar Todo" y recargar toda esa información. Pide
  confirmación antes de reemplazar los datos actuales.
- **Importar CSV**: permite cargar datos iniciales de contratos (y
  opcionalmente sus primeros recibos) desde un archivo `.csv`. El mapeo de
  columnas esperado se puede ajustar al inicio del código, en la constante
  `MAPEO_CSV_IMPORTACION`.
- **Restaurar Datos**: borra todos los contratos y recibos registrados en
  este navegador (usar con precaución; pide confirmación).

## Publicación en GitHub Pages

El repositorio incluye `.github/workflows/deploy.yml`, que publica
automáticamente `index.html` en GitHub Pages con cada push a `main`.

Pasos para publicarlo desde cero:

1. Cree un repositorio nuevo en GitHub (puede ser público o privado, pero
   recuerde que GitHub Pages gratuito publica el contenido públicamente).
2. Suba el contenido de esta carpeta a la rama `main` del repositorio.
3. En GitHub, vaya a **Settings → Pages** y en **Source** seleccione
   **GitHub Actions**.
4. Con el primer push a `main`, el workflow se ejecutará solo y publicará
   el sitio. La URL final aparece en la pestaña **Actions** (dentro de la
   ejecución del workflow) y también en **Settings → Pages**.

## Notas

- Como los datos viven en el navegador (localStorage), cada persona que
  abra el sitio publicado tendrá su propia copia de datos, independiente
  de las demás. Por eso es importante respaldar (`Respaldar Todo`) con
  frecuencia.
- El sistema no incluye datos de ejemplo reales: arranca vacío. Use
  **Importar CSV** o **Restaurar Respaldo** para cargar información.
