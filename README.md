# AXIOM Math Club: sitio web de tutorías

Sitio donde los estudiantes reservan sesiones con los tutores de AXIOM.

- **Calendario del club**: muestra los eventos futuros y la disponibilidad de cada tutor (un color por tutor). Al tocar un día se ven los detalles y un botón para reservar ese día.
- El estudiante escoge **tema** (lista desplegable), **día** y **hora**. Solo ve horas en que algún tutor está disponible.
- Al reservar, **el tutor recibe un email** con los datos del estudiante y **el estudiante recibe una confirmación**.
- Todo se guarda en una **Google Sheet**: ahí los tutores ponen su disponibilidad y ven las reservas.

Mientras no conectes el backend, el sitio funciona en **modo demo** (horarios de ejemplo, sin emails).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `script.js`, `logo.png` | El sitio (estático, se puede hospedar gratis) |
| `Code.gs` | Backend en Google Apps Script: calcula horarios libres, guarda reservas y envía los emails |

## Configuración (unos 10 minutos)

### 1. Crear la hoja y el backend
1. Crea una Google Sheet nueva con la cuenta de Gmail del club (los emails saldrán desde esa cuenta).
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega todo el contenido de `Code.gs`. Guarda.
3. Arriba, selecciona la función `setup` y presiona **Ejecutar**. Acepta los permisos (Google avisará que la app no está verificada: *Configuración avanzada → Ir a…*). Esto crea las pestañas `Availability`, `Topics`, `Events` y `Bookings`. `Availability` ya viene con los cuatro tutores y los horarios de Hernandez (lun y mié, 18:00–19:00) y Merle Cintron (mar y jue, 12:30–14:30). Faltan los de Vivas y Cortes Garay: llena `Day`, `Start` y `End` en sus filas. **Escribe el email de cada tutor en la columna `Tutor Email`** (no están en el código para que no queden públicos en GitHub).

### 2. Poner la disponibilidad de los tutores
En la pestaña **Availability**, una fila por bloque de tiempo:

| Tutor | Tutor Email | Day | Start | End |
|---|---|---|---|---|
| C/3C Hernandez | *(email)* | Monday | 18:00 | 19:00 |
| C/3C Hernandez | *(email)* | Wednesday | 18:00 | 19:00 |
| C/2d Lt Merle Cintron | *(email)* | Tuesday | 12:30 | 14:30 |
| C/2d Lt Merle Cintron | *(email)* | Thursday | 12:30 | 14:30 |
| C/2d Lt Vivas | *(email)* | | | |
| C/Maj Cortes Garay | *(email)* | | | |

- **Day**: un día de la semana (inglés o español) se repite cada semana; una fecha (`2026-10-28` o `10/28/2026`) es solo ese día.
- El bloque se divide en sesiones de 30 minutos. Si dos tutores coinciden, el estudiante ve "2 tutors free" y se asigna al primero libre.
- Un tutor puede tener varias filas (una por cada día o bloque).
- El nombre del tutor se escribe igual en todas sus filas; así se le asigna el mismo color en el calendario.
- Los emails **no** se muestran en el sitio; solo se usan para enviar las notificaciones.

### 2b. Eventos del calendario
En la pestaña **Events**, una fila por evento:

| Date | Start | End | Title | Location | Details |
|---|---|---|---|---|---|
| 2026-10-28 | | | AXIOM 1st Meeting | | Our first club meeting. Everyone is welcome. |

Si dejas `Start` vacío, el sitio muestra "Time TBA". El calendario se actualiza al recargar la página.

En **Topics** pueden añadir, quitar o renombrar temas; la lista desplegable del sitio se actualiza sola.

### 3. Publicar el backend
1. En Apps Script: **Implementar → Nueva implementación → Tipo: Aplicación web**.
2. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier persona**.
3. Copia la URL que termina en `/exec`.
4. En `script.js`, línea 3, pégala: `const API_URL = "https://script.google.com/macros/s/…/exec";`

> Si luego cambias `Code.gs`, usa **Implementar → Gestionar implementaciones → Editar → Nueva versión** para que la URL siga igual.

### 4. Subir el sitio
Cualquier hosting estático sirve. Lo más fácil:
- **Netlify Drop** (app.netlify.com/drop): arrastra la carpeta y listo.
- **GitHub Pages**: sube los archivos a un repositorio y activa Pages en *Settings → Pages*.

## Uso diario
- **Ver reservas**: pestaña `Bookings`.
- **Cancelar una reserva**: cambia `Status` a `Cancelled`; la hora vuelve a quedar libre.
- **Avisar a más personas** (ej. el presidente del club): en `Code.gs`, `alsoNotify: 'presidente@gmail.com'`.
- **Ajustes** en `CONFIG` de `Code.gs`: duración de sesión, cuántos días adelante se puede reservar, y con cuántas horas de anticipación mínima.
- La fecha de la primera reunión ("Oct. 28") está en `index.html`.

## Límites
Gmail gratis permite unos 100 emails al día desde Apps Script (cada reserva usa 2). Para un club escolar sobra.
