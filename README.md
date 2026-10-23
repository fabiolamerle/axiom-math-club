# AXIOM Math Club: sitio web de tutorías

Sitio donde los estudiantes reservan sesiones con los tutores de AXIOM.

- **Calendario del club**: muestra los eventos futuros y la disponibilidad de cada tutor (un color por tutor). Al tocar un día se ven los detalles y un botón para reservar ese día.
- El estudiante escoge **tema** (lista desplegable), **día** y **hora**. Solo ve horas en que algún tutor está disponible.
- El estudiante escoge si la sesión es **In person** u **Online**, y pone su **email y teléfono**. Al pedir la sesión, **el tutor recibe un email con botones Accept / Decline**.
- Cuando el tutor contesta, **el estudiante recibe un email** diciendo si fue aceptada o no. Si se rechaza, la hora queda libre otra vez.
- Todo se guarda en una **Google Sheet**: ahí los tutores ponen su disponibilidad y ven las reservas.

Mientras no conectes el backend, el sitio funciona en **modo demo** (horarios de ejemplo, sin emails).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` (Home), `about.html` (misión), `book.html` (reservar), `calendar.html` (calendario), `tutor.html` (ser tutor) | Las 5 páginas del sitio |
| `admin.html`, `admin.js` | Panel de admin con estadísticas (protegido con contraseña) |
| `styles.css`, `script.js`, `logo.png` | Diseño, lógica y logo, compartidos por todas las páginas |
| `Code.gs` | Backend en Google Apps Script: calcula horarios libres, guarda reservas y envía los emails |

## Configuración (unos 10 minutos)

### 1. Crear la hoja y el backend
1. Crea una Google Sheet nueva con la cuenta de Google que va a manejar el sistema (puede ser un Gmail personal). Los emails a tutores y estudiantes salen desde esa cuenta, con el nombre "AXIOM Math Club".
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega todo el contenido de `Code.gs`. Guarda.
3. Arriba, selecciona la función `setup` y presiona **Ejecutar**. Acepta los permisos (Google avisará que la app no está verificada: *Configuración avanzada → Ir a…*). Esto crea las pestañas `Availability`, `Topics`, `Events` y `Bookings`. `Availability` ya viene con los cuatro tutores, sus emails y los horarios de Hernandez (lun y mié, 18:00–19:00) y Merle Cintron (mar y jue, 12:30–14:30) Vivas (lun a vie, 16:30–19:30) y Cortes Garay (mar y jue 15:00–18:00, vie 14:00–17:00).

### 2. Poner la disponibilidad de los tutores
En la pestaña **Availability**, una fila por bloque de tiempo:

| Tutor | Tutor Email | Day | Start | End |
|---|---|---|---|---|
| C/3C Hernandez | luan.hernandez@upr.edu | Monday | 18:00 | 19:00 |
| C/3C Hernandez | luan.hernandez@upr.edu | Wednesday | 18:00 | 19:00 |
| C/2d Lt Merle Cintron | Fabiola.merle@upr.edu | Tuesday | 12:30 | 14:30 |
| C/2d Lt Merle Cintron | Fabiola.merle@upr.edu | Thursday | 12:30 | 14:30 |
| C/2d Lt Vivas | Julian.vivas@upr.edu | Monday | 16:30 | 19:30 |
| C/2d Lt Vivas | Julian.vivas@upr.edu | Tuesday … Friday (una fila por día) | 16:30 | 19:30 |
| C/Maj Cortes Garay | Jorge.cortes4@upr.edu | Tuesday | 15:00 | 18:00 |
| C/Maj Cortes Garay | Jorge.cortes4@upr.edu | Thursday | 15:00 | 18:00 |
| C/Maj Cortes Garay | Jorge.cortes4@upr.edu | Friday | 14:00 | 17:00 |

- **Day**: un día de la semana (inglés o español) se repite cada semana; una fecha (`2026-10-28` o `10/28/2026`) es solo ese día.
- El estudiante escoge la duración (30 min, 1 hora o 2 horas) y ve cada hora con el nombre del tutor libre. Solo salen las horas en que ese tutor está libre toda la sesión.
- **Sesiones en grupo:** hasta 4 cadetes (`maxCadets` en `Code.gs`) pueden reservar al mismo tutor a la misma hora. Desde el segundo cadete, el sitio muestra un aviso y el cadete tiene que aceptar compartir la sesión. La columna `Shared` de `Bookings` dice cuántos cadetes había al reservar. En el Admin, una sesión en grupo cuenta una sola vez para las horas del tutor.
- Un tutor puede tener varias filas (una por cada día o bloque).
- El nombre del tutor se escribe igual en todas sus filas; así se le asigna el mismo color en el calendario.
- Los emails **no** se muestran en el sitio; solo se usan para enviar las notificaciones.
- **Meeting Link** (columna F): el link fijo de Zoom o Teams de cada tutor. Basta ponerlo en una fila del tutor. Cuando el tutor acepta una sesión **Online**, el cadete recibe ese link en el email de confirmación. Si el tutor no tiene link, el email dice que el tutor se lo enviará. El link no aparece en el sitio.

### 2b. Eventos del calendario
En la pestaña **Events**, una fila por evento:

| Date | Start | End | Title | Location | Details |
|---|---|---|---|---|---|
| 2026-10-28 | 16:30 | | AXIOM 1st Meeting | Room 104 | Our first club meeting. Everyone is welcome. |

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

## Cómo funciona una reserva
1. El estudiante escoge tema, duración, día, hora con tutor, si es In person u Online, y pone nombre, email, teléfono y AS year.
2. La reserva queda como **Pending** en `Bookings` y esa hora ya no se le ofrece a nadie más.
3. El tutor recibe un email con los datos del estudiante y los botones **Accept** y **Decline**. Al tocar uno se abre una página para confirmar (así los filtros de seguridad del correo no pueden contestar solos).
4. El estudiante recibe un email: **Confirmed** si se aceptó, o **Not available** con un enlace para escoger otra hora si se rechazó. Una sesión rechazada libera la hora.

## Actualizar el código (cuando cambie `Code.gs`)
1. En Apps Script, borra todo, pega el `Code.gs` nuevo y guarda.
2. Si hay columnas nuevas, selecciona `setup` y presiona **Ejecutar** (añade las columnas que falten sin borrar nada).
3. **Implementar → Gestionar implementaciones →** lápiz ✏️ **→ Versión: Nueva versión → Implementar**. La URL `/exec` sigue igual.

## Aplicaciones de tutores
La sección **Want to be a tutor?** del sitio guarda cada aplicación en la pestaña **Tutor Applications** y envía un email a la cuenta dueña del sistema (y a `alsoNotify`). El aspirante recibe una confirmación. Usa la columna `Status` para llevar el control (New, Contacted, Accepted…). Para aceptar a alguien como tutor, añade sus filas en **Availability**.

El QR del sitio está en `qr-code.png`.

## Panel de admin
`admin.html` (enlace "Admin" al pie de cada página) muestra: sesiones completadas, horas por tutor, cadetes ayudados, temas más pedidos, sesiones por semana, en persona vs online, solicitudes por AS year y estado de las solicitudes. Se puede filtrar por todo el tiempo, este semestre, este mes o los últimos 30 días, y descargar las horas de cada tutor en CSV.

- La contraseña se guarda en Apps Script, no en GitHub: **Configuración del proyecto ⚙️ → Propiedades de la secuencia de comandos → Agregar propiedad**, nombre `ADMIN_PASSWORD`, valor la contraseña.
- El panel nunca recibe nombres, emails ni teléfonos de los cadetes; solo los datos para las estadísticas.
- Después de 10 contraseñas incorrectas se bloquea por 10 minutos.

## Uso diario
- **Ver reservas**: pestaña `Bookings` (columna `Status`: Pending, Accepted o Declined).
- **Cancelar una reserva**: cambia `Status` a `Cancelled`; la hora vuelve a quedar libre.
- **Avisar a más personas** (ej. el presidente del club): en `Code.gs`, `alsoNotify: 'presidente@gmail.com'`.
- **Ajustes** en `CONFIG` de `Code.gs`: duración de sesión, cuántos días adelante se puede reservar, y con cuántas horas de anticipación mínima (`minNoticeHours`, ahora 1 hora: se puede reservar el mismo día).
- La fecha de la primera reunión está en `index.html`. El texto del anuncio que se mueve arriba (disclaimer) está en las 5 páginas: si lo cambias, cámbialo en todas.

## Límites
Gmail gratis permite unos 100 emails al día desde Apps Script (cada reserva usa 3: tutor, estudiante y la respuesta). Para un club escolar sobra.
