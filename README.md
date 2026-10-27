# FinOpsDA-BO
Espacio de agrupación de automatización y sistemas de información creados para el equipo de Fin Ops 

## Carga de facturación desde Google Sheets

El importador de Apps Script está en `apps-script/`. Para usarlo:

1. Abre la hoja de cálculo que contiene las pestañas de proveedores y entra a **Extensiones > Apps Script**.
2. Copia `apps-script/Code.gs` al editor. En **Configuración del proyecto**, habilita la visualización del manifiesto `appsscript.json` y reemplázalo con el contenido de `apps-script/appsscript.json`.
3. Verifica que la cuenta que ejecutará el script tenga permisos de escritura en la base de datos Firestore `ntr-boldcf` del proyecto `black-hulling-462522-j2`.
4. Ejecuta `consolidarYExportarFirebase` y concede los permisos solicitados.

El script procesa las pestañas configuradas, identifica las columnas por encabezados y crea o actualiza documentos en `facturacion_consolidada`. Las ejecuciones repetidas reutilizan identificadores de documento deterministas; no se eliminan documentos de filas que hayan sido borradas de la hoja. El código de Apps Script se excluye del despliegue de Firebase Hosting.

La vista de facturación resume costos, gastos y total del mes actual, y presenta gráficos lineales mensuales por tipo y canal junto con la tabla consolidada. Dos controles deslizantes permiten elegir el mes inicial y final; el filtro de tipo actualiza la tabla y los gráficos. Los registros cuyo `Tipo_Registro` no contenga “costo” ni “gasto” se muestran como “Sin clasificar”. El NTR queda pendiente hasta incorporar ingresos y cantidad de transacciones. El panel permite desplazamiento vertical para recorrer las tarjetas, gráficos y tabla.

### Acceso al sitio y datos NTR

Al abrir el sitio, se muestra `login.html`; el panel y las consultas a Firestore quedan bloqueados hasta iniciar sesión con una cuenta Google verificada `@bold.co`. El botón **Cerrar sesión** finaliza la sesión y devuelve al inicio de sesión. Para activar el acceso:

1. En Firebase Console, abre **Authentication > Sign-in method** y habilita el proveedor **Google**.
2. En **Authentication > Settings > Authorized domains**, confirma que `ntrcfbold.web.app` y `ntrcfbold.firebaseapp.com` estén en la lista.
3. Publica las reglas de Firestore para la base nombrada `ntr-boldcf` con `firebase deploy --only firestore:rules`.
4. Publica el sitio actualizado con `firebase deploy --only hosting`.

Las reglas de [firestore.rules](./firestore.rules) permiten lectura solo a cuentas Google verificadas `@bold.co` en las colecciones requeridas y deniegan escrituras desde el navegador. El importador de Apps Script usa su propio token de Google para escribir. La autenticación del sitio no sustituye la publicación de reglas: si Firestore muestra `Missing or insufficient permissions`, confirma que estas reglas estén desplegadas en `ntr-boldcf`, no solo en `(default)`.

Antes de publicar reglas, revisa si la base `ntr-boldcf` tiene otras colecciones usadas por otros módulos: este archivo deniega por defecto el acceso a cualquier ruta no indicada, así que habría que integrar aquí sus reglas existentes en vez de reemplazarlas sin revisarlas.
