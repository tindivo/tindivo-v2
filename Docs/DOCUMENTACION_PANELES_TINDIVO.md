# DOCUMENTACIÓN TÉCNICA Y DE PRODUCTO: PANELES DE TINDIVO

Esta documentación detalla de forma objetiva la estructura, elementos de interfaz, flujos de acciones, reglas de negocio y patrones de diseño observados en los paneles administrativo y de restaurante de **Tindivo** (sistema de delivery hiperlocal para pueblos del interior de Perú).

---

## 1. PANEL SUPER-ADMIN (Dashboard del Propietario / Super-Admin)

*   **Ruta/Componente Principal:** `app/owner/components/OwnerTable.tsx` / `OnboardingForm.tsx`
*   **Propósito:** Herramienta de control global para los administradores generales de la plataforma (rol `OWNER`). Permite dar de alta nuevos negocios, gestionar planes de suscripción, banear/desbanear cuentas, descargar activos visuales y acceder en "Modo Dios" (impersonación) a la consola individual de cualquier restaurante.

### 1.1 Elementos de UI Visibles
*   **Acciones Globales Superiores:**
    *   Botón **"Descargar Logos (.zip)"** (`neutral-800`, borde semitransparente, ícono `Download`): Descarga asíncronamente un archivo ZIP con todos los logotipos de los restaurantes almacenados en el sistema.
    *   Botón **"Nuevo Restaurante"** (`#FF6600` naranja vibrante, texto e ícono negros, ícono `Plus`): Abre el modal de creación de negocio.
*   **Barra de Búsqueda y Filtros:**
    *   Input de texto con ícono `Search` para buscar restaurantes en tiempo real por coincidencia en el nombre o WhatsApp.
    *   Dropdown con ícono `Filter` que permite segmentar el listado por estado: "Todos" (`ALL`), "Activos" (`ACTIVE`) y "Baneados" (`BANNED`).
*   **Listado de Restaurantes (Tarjetas Minimalistas "Tambo"):**
    *   Puntos de estado con sombra difuminada (brillo de neón): Verde para publicado (`PUBLISHED`), Azul para activo básico (`ACTIVE`) y Rojo para baneado (`BANNED`).
    *   Nombre del negocio en tipografía bold con interlineado estrecho.
    *   Enlace de previsualización clickable (`/restaurantes/{slug}`) en color gris con hover naranja, que abre el catálogo del cliente en otra pestaña.
    *   Botón de menú contextual de 3 puntos (`MoreVertical`) con tamaño táctil garantizado de 44x44 píxeles.
*   **Menú Contextual Desplegable:**
    *   **Acceder al Dashboard** (ícono `LogIn`): Inicia impersonación del negocio.
    *   **Gestionar Plan** (ícono `BadgeInfo`): Abre modal de suscripciones.
    *   **Contactar** (ícono `MessageCircle`): Abre enlace a WhatsApp.
    *   **Banear (Ocultar) / Restaurar** (ícono `ShieldAlert`): Toggle de estado de visibilidad.
    *   **Eliminar Definitivamente** (ícono `Trash2`, texto rojo): Borrado físico irreversible.
*   **Modal de Registro de Nuevo Restaurante:**
    *   **Paso 1: Verificación de Dueño:** Campo de correo electrónico (Gmail) y botón "Verificar e Iniciar". Valida que el usuario exista en la base de datos de Tindivo y no posea ya un restaurante asignado.
    *   **Paso 2: Formulario Onboarding (`OnboardingForm`):**
        *   Campo "Nombre del Negocio" (máximo 50 caracteres) con contador dinámico (cambia a rojo al alcanzar el límite).
        *   Chips de selección de categoría (máximo 2 seleccionables en paralelo).
        *   Checkboxes con estilo de tarjetas para "WhatsApp" (verde, ícono `MessageCircle`) y "Llamadas" (azul, ícono `Phone`). Al activar cada checkbox, se desliza un input con la bandera peruana `🇵🇪` y el código fijo `+51`, exigiendo exactamente 9 dígitos.
        *   Selector de Ciudad/Localidad (dropdown pre-poblado con "San Jacinto").
        *   Botón final "Crear Catálogo" con ícono de flecha derecha.

*   **Modal de Gestión de Plan:**
    *   Caja de información con el "Plan Actual" (destacado en naranja con texto negro, ej. `VIP` o `BASIC`).
    *   Caja de información con la "Fecha de Vigencia" del plan (formato de fecha local).
    *   Botón **"Hacer Upgrade a VIP"** (`#FF6600`): Promueve el negocio a plan VIP.
    *   Botón **"Renovar 1 mes"** (`white/10`): Extiende la suscripción actual por 30 días calendario adicionales.

### 1.2 Flujo de Acciones Paso a Paso
1.  **Impersonación ("Modo Dios"):**
    Super-Admin hace clic en `MoreVertical` de un restaurante $\rightarrow$ Selecciona "Acceder al Dashboard" $\rightarrow$ Se dispara la Server Action `setImpersonationCookie` $\rightarrow$ Se guardan cookies seguras y no editables con el ID y nombre del negocio $\rightarrow$ Muestra toast de carga $\rightarrow$ Se fuerza un refresco de página duro (`window.location.href = '/admin'`) para limpiar la caché de cliente de Next.js $\rightarrow$ El Super-Admin visualiza el panel de restaurante exactamente como lo vería el dueño.
2.  **Baneo/Ocultación:**
    Super-Admin hace clic en `MoreVertical` $\rightarrow$ Selecciona "Banear (Ocultar)" $\rightarrow$ Si el negocio está activo, se solicita confirmación nativa del navegador (`confirm`) $\rightarrow$ Se ejecuta `toggleRestaurantBan` en el servidor $\rightarrow$ El estado cambia a `BANNED` $\rightarrow$ Se actualiza la interfaz optimistamente y el punto de estado cambia a rojo $\rightarrow$ El restaurante ya no es visible en el buscador público.
3.  **Eliminación Permanente:**
    Super-Admin hace clic en `MoreVertical` $\rightarrow$ Selecciona "Eliminar Definitivamente" $\rightarrow$ Se solicita confirmación nativa del navegador explicando que se borrarán catálogos, planes y métricas $\rightarrow$ Se solicita una segunda confirmación de seguridad $\rightarrow$ Se ejecuta `deleteRestaurantPermanently` $\rightarrow$ Se eliminan el restaurante, su suscripción y su analítica $\rightarrow$ Se remueve la tarjeta de la lista.
4.  **Alta de Negocio:**
    Super-Admin hace clic en "Nuevo Restaurante" $\rightarrow$ Digita el correo del dueño $\rightarrow$ Clic en "Verificar" $\rightarrow$ Si el usuario es apto, aparece el formulario de Onboarding $\rightarrow$ Llena los datos $\rightarrow$ Clic en "Crear Catálogo" $\rightarrow$ Se realiza llamada POST asíncrona $\rightarrow$ Creado con éxito, se refresca la tabla.

### 1.3 Estados y Casos Edge
*   **Validaciones de Onboarding:**
    *   No se puede avanzar en la creación si el correo ingresado no está registrado previamente como usuario regular.
    *   Si el usuario ya tiene un restaurante asociado, el sistema arroja error inmediato en un toast y bloquea el flujo.
    *   Es obligatorio seleccionar al menos un canal de contacto (WhatsApp o Llamadas) y los campos habilitados deben contener estrictamente 9 dígitos numéricos.
    *   El botón de submit se deshabilita si no se cumple el formato de contactos, si el nombre tiene menos de 2 letras o si no hay ciudad seleccionada.
*   **Caso Sin Datos:** Si la búsqueda no arroja coincidencias, se despliega el mensaje centralizado: *"No hay restaurantes que coincidan."* en color gris neutro.
*   **Confirmaciones Multi-Fase:** El borrado exige dos prompts secuenciales de confirmación para evitar pérdidas accidentales en producción.

### 1.4 Evaluaciones de Producción
*   ✅ **Lo que funcionó bien:** 
    *   La impersonación basada en cookies seguras de corta duración (2 horas) permite resolver problemas de soporte a clientes en segundos sin requerir contraseñas.
    *   La descarga masiva de logos en un único ZIP comprimido facilita labores de marketing y diseño institucional fuera de la plataforma.
*   ⚠️ **Limitaciones / Problemas detectados:**
    *   El listado no posee paginación nativa en el frontend ni en la server action, lo que podría degradar el rendimiento del navegador al escalar a cientos de registros.
    *   El slug del negocio es autogenerado en base al nombre durante el onboarding y queda inmutable; cualquier cambio de nombre posterior en el perfil no actualiza el slug para evitar romper códigos QR impresos en las mesas, limitando la re-estructuración de la URL.

---

## 2. PANEL DE RESTAURANTE — DASHBOARD PRINCIPAL

*   **Ruta/Componente Principal:** `app/admin/page.tsx` / `components/DashboardUI.tsx`
*   **Propósito:** Centro de control del dueño del negocio. Monitorea la completitud de la información de su catálogo, gestiona la disponibilidad operativa en tiempo real, permite la difusión del enlace digital y proporciona estadísticas del rendimiento de visitas y clics de contacto.

### 2.1 Elementos de UI Visibles
*   **Encabezado de Bienvenida:** Saludo personalizado al usuario autenticado ("¡Hola, {Nombre}! 👋") acompañado de una descripción dinámica que varía según el estado de la cuenta.
*   **Indicador de Salud de Perfil (`ProfileHealth`):**
    *   Sección inteligente que evalúa los campos requeridos para publicar el catálogo. Si falta alguno, muestra una tarjeta de alerta en fondo naranja translúcido (`bg-orange-500/10`) con borde coordinado, texto persuasivo y un botón directo a la configuración de la sección omitida.
    *   Alerta por falta de **Logo**: *"Sube tu logo para mayor confianza y reconocimiento visual."*
    *   Alerta por falta de **Portada Principal**: *"Una buena foto de portada principal aumenta drásticamente tus ventas."*
    *   Alerta por falta de **Horarios**: *"Configura tus horarios para aparecer 'ABIERTO' automáticamente sin intervenir."*
    *   Alerta por falta de **Menú**: *"Un catálogo vacío no vende. Agrega al menos un producto..."*
    *   Alerta por falta de **Ubicación exacta**: *"Tus clientes necesitan saber dónde queda tu local o desde dónde repartes..."*
    *   Banner de perfil óptimo: Si todo está cargado, muestra banner verde (`bg-green-500/10`) con checkmark: *"¡Tu perfil está al 100%! Ya eres visible."*
*   **Banner de Suscripción Inactiva (Paywall):**
    *   Se muestra de forma destacada solo si el perfil está completo al 100% pero no existe una suscripción activa pagada.
    *   Fondo naranja con borde pronunciado e ícono de cohete (`Rocket`).
    *   Botón de acción verde **"Activar mi cuenta"** con ícono de WhatsApp, que abre un chat directo con soporte técnico Tindivo con un mensaje pre-configurado que incluye el nombre del restaurante para agilizar la activación comercial.
*   **Módulo de Enlace de Catálogo:**
    *   Muestra el link directo del restaurante en color naranja destacado.
    *   Si el catálogo está publicado: Muestra el botón **"Copiar Link"** (que se transforma en "¡Copiado!" con check verde al hacer clic) y el botón **"Compartir Menú"** (dispara la API nativa de compartición de móviles `navigator.share`).
    *   Si no está publicado: Muestra un único botón gris **"Ver vista previa"** con ícono de enlace externo.
*   **Módulo de Estado Operativo (Toggle de Apertura/Cierre):**
    *   Toggle de diseño iOS (Verde cuando está activo, gris cuando está inactivo).
    *   Mensaje explicativo dinámico:
        *   **Activo (Abierto):** *"Automático: Tu catálogo respetará los horarios que configuraste."*
        *   **Inactivo (Cerrado):** *"Forzado: Tu catálogo aparece como CERRADO, ignorando tus horarios."*
*   **Módulo de Rendimiento (Métricas de 7 días):**
    *   Tarjetas de resumen numérico:
        *   **Visitas:** Fondo naranja con ícono de ojo (`Eye`), muestra la suma total de aperturas del catálogo.
        *   **Contactos:** Fondo verde con ícono de usuarios (`Users`), muestra el total de clics en los botones de llamada y WhatsApp, incluyendo micro-badges con el desglose exacto (ej. `WA: 12`, `TEL: 4`).
    *   **Gráfico de Barras Interactivo (`recharts`):** Gráfico de barras apiladas y estilizadas en modo oscuro. Ejes con tipografía pequeña y estilizada gris, cuadrícula de referencia sutil y barras de color naranja (Visitas), verde (WhatsApp) y azul (Llamadas). Cuenta con tooltip interactivo flotante adaptado al diseño visual.
*   **Pie de Página (Soporte Técnico):**
    *   Banner permanente para chatear con soporte Tindivo, con badge destacado en hover.

### 2.2 Flujo de Acciones Paso a Paso
1.  **Compartir Enlace en Dispositivo Móvil:**
    Usuario hace clic en "Compartir Menú" $\rightarrow$ El sistema evalúa si el navegador soporta `navigator.share` $\rightarrow$ Abre la sábana nativa del sistema operativo (Android/iOS) con el título del catálogo y un mensaje invitando a realizar pedidos $\rightarrow$ Si el navegador no lo soporta (ej. Chrome en PC clásica), copia automáticamente el enlace en el portapapeles de forma silenciosa y despliega un toast confirmando la copia.
2.  **Forzado de Cierre de Emergencia:**
    El negocio está en su horario habitual pero tiene un percance $\rightarrow$ El dueño hace clic en el interruptor de "Estado Operativo" $\rightarrow$ El botón cambia a gris de inmediato (interfaz optimista) $\rightarrow$ Se ejecuta la Server Action `toggleRestaurantStatus(false)` $\rightarrow$ El backend marca `isManuallyClosed = true` $\rightarrow$ El catálogo del cliente final se muestra instantáneamente como cerrado, previniendo que los clientes agreguen productos al carrito de compras.

### 2.3 Estados y Casos Edge
*   **Restaurante Baneado:** Si el Super-Admin aplicó un baneo al restaurante, la interfaz de administración carga un banner rojo superior fijo (`BannedBanner`) que alerta al dueño: *"Tu cuenta ha sido suspendida temporalmente..."*
*   **Modo Impersonado (Super-Admin):** Cuando un Super-Admin ingresa al panel mediante Modo Dios, se renderiza en la parte superior el `ImpersonationBanner` en color negro con texto llamativo naranja, permitiendo ver el nombre del negocio y un botón prominente para "Salir e ir al panel global".
*   **Sin Datos de Métricas:** Si el restaurante es nuevo o no ha recibido tráfico, la sección del gráfico oculta el contenedor de `recharts` y muestra la leyenda: *"Aún no hay datos para mostrar."* en color gris tenue.

### 2.4 Evaluaciones de Producción
*   ✅ **Lo que funcionó bien:** 
    *   El checklist de Salud del Perfil funciona excepcionalmente bien en producción para auto-educar al microempresario del interior, reduciendo drásticamente las consultas de soporte sobre *"¿por qué no se ve mi negocio en la app?"*.
    *   El forzado manual de cerrado es una característica muy elogiada por los restaurantes para controlar picos de demanda imprevistos.
*   ⚠️ **Limitaciones / Problemas detectados:**
    *   El cálculo del estado de "Perfil Completo" requiere de manera binaria la existencia de la geolocalización, menú, horarios y fotos; la omisión de un solo elemento (ej. no colocar foto de portada) bloquea la publicación en el buscador general.

---

## 3. PANEL DE RESTAURANTE — GESTIÓN DEL MENÚ

*   **Ruta/Componente Principal:** `app/admin/menu/components/SortableMenu.tsx` / `SortableSection.tsx` / `SortableProduct.tsx`
*   **Propósito:** Consola de edición del catálogo de comidas y bebidas. Utiliza tecnología de arrastrar y soltar (Drag and Drop) para reordenar la jerarquía visual de los platos y las secciones del menú, facilitando la edición diaria y el control de inventario/disponibilidad.

### 3.1 Elementos de UI Visibles
*   **Acción Superior de Estructura:**
    *   Botón **"Añadir Sección"** (Fondo `#1E1E1E`, borde discontinuo que pasa a naranja en hover): Permite crear una nueva categoría en el menú (ej. "Bebidas", "Postres").
*   **Listado de Secciones Sortables (Acordeón Avanzado):**
    *   Barra de agarre lateral con textura de puntos (`GripVertical`) para arrastre.
    *   Nombre de la sección en formato bold. Si la sección está oculta, el texto cambia a color rojo difuminado y se le añade el tag `(Oculta)`.
    *   Burbuja con la cantidad de platos contenidos dentro de la categoría.
    *   Botón de menú de opciones de sección (`MoreVertical`): Despliega un switch para alternar visibilidad de la sección completa y las opciones de "Editar Nombre" y "Eliminar Sección".
    *   Chevron de expansión de acordeón.
*   **Cuerpo de la Sección Expandida:**
    *   Botón **"Añadir Plato"** (Borde discontinuo, ícono `Plus`): Abre el modal de creación de producto para esa sección específica.
    *   Botón **"Selección Rápida"** (Borde discontinuo, ícono `ListChecks`): Activa el modo de gestión rápida de stock diario.
*   **Tarjetas de Platos Sortables (Dentro de Sección):**
    *   Miniatura del plato (borde redondeado). Si no cuenta con imagen, muestra por defecto el emoji `🍔` en tamaño grande sobre fondo gris texturizado.
    *   Nombre del plato y descripción corta en gris neutro. Si el plato está inactivo, el texto se renderiza tachado o en color gris apagado.
    *   Precio formateado con el símbolo de moneda nacional (`S/ 15.50`).
    *   Menú desplegable de opciones individuales del plato: "Disponible/Oculto" (switch interactivo), "Editar", "Duplicar" y "Eliminar".
*   **Modal de Registro/Edición de Platos:**
    *   Caja de carga de imagen en la parte superior (diseño cuadrado con bordes redondeados y dashed). Permite arrastrar o seleccionar una foto. Si ya existe una, muestra la vista previa a pantalla completa en la caja.
    *   Campo "Nombre" (requerido, hasta 40 caracteres).
    *   Campo "Precio (S/)" (requerido, numérico, admite decimales con pasos de 0.10 centavos).
    *   Campo "Descripción corta" (opcional, máximo 100 caracteres).
*   **Barra de Acción de Selección Rápida (Stock Diario):**
    *   Cuando el modo de selección rápida está activo, el arrastre de elementos se congela. Los platos se muestran como una lista de tarjetas clickeables con un checkbox a la derecha.
    *   Se activa una **Barra Inferior Fija Flotante** (`fixed bottom-0`) con sombreado difuminado negro en la parte trasera, con botones gigantes: "Cancelar" y "Guardar Menú (X seleccionados)".

### 3.2 Flujo de Acciones Paso a Paso
1.  **Reordenamiento por Arrastre (Drag and Drop):**
    *   El usuario presiona y arrastra el ícono `GripVertical` de un plato $\rightarrow$ El elemento se desprende visualmente adquiriendo un borde naranja brillante y proyectando una sombra profunda (`DragOverlay`) $\rightarrow$ El usuario puede desplazar el plato verticalmente dentro de la sección o **arrastrarlo hacia otra categoría diferente** $\rightarrow$ Al soltar el plato, la interfaz actualiza el orden en tiempo real y el sistema ejecuta de fondo la Server Action `bulkReorderMenu` con toda la nueva jerarquía de IDs para guardarla en la base de datos de MongoDB.
    *   El mismo comportamiento aplica a nivel de secciones completas. Al arrastrar una sección, el `DragOverlay` muestra una versión compacta que indica el número de ítems que se están moviendo en bloque.
2.  **Duplicación de Platos:**
    El usuario hace clic en las opciones del plato $\rightarrow$ Selecciona "Duplicar" $\rightarrow$ El sistema duplica el registro en la base de datos con el sufijo `(Copia)` y estado inactivo para evitar errores de publicación de precios viejos $\rightarrow$ Se inserta el duplicado inmediatamente debajo del plato original.
3.  **Selección Rápida de Menú del Día:**
    El dueño de una pollería inicia jornada $\rightarrow$ Hace clic en "Selección rápida" de la sección "Platos a la Carta" $\rightarrow$ Se congela el drag and drop $\rightarrow$ Va marcando con un toque los platos que preparó para el día $\rightarrow$ Los no seleccionados se marcan automáticamente como inactivos $\rightarrow$ Hace clic en "Guardar Menú" en la barra fija inferior $\rightarrow$ El sistema realiza una actualización por lotes en el servidor de forma inmediata.

### 3.3 Estados y Casos Edge
*   **Control del Gesto Táctil (Móviles):**
    *   Para evitar que el scroll vertical de la pantalla en celulares interfiera con el arrastre de platos, el sistema cuenta con restricciones de activación:
        *   **Mouse:** Requiere arrastrar un mínimo de 8 píxeles para iniciar el movimiento (permite hacer clic en opciones sin disparar arrastres accidentales).
        *   **Pantallas Táctiles:** Requiere una **pulsación larga sostenida de 250 milisegundos** con una tolerancia de movimiento de máximo 5 píxeles para desbloquear el arrastre.
*   **Eliminación Destructiva:** Al eliminar una sección completa, se despliega una advertencia que avisa explícitamente que se borrarán de forma irreversible todos los platos asociados a esa categoría.

### 3.4 Evaluaciones de Producción
*   ✅ **Lo que funcionó bien:** 
    *   El modo de Selección Rápida con barra de acciones fija al final es la función más valorada en producción por los restaurantes de comida rápida y menús del día. Les permite apagar los platos agotados en hora punta con tres toques desde el celular, previniendo cancelaciones de pedidos por falta de stock.
    *   El arrastre cross-section (mover un plato de una categoría a otra) es sumamente intuitivo y fluido en dispositivos móviles.
*   ⚠️ **Limitaciones / Problemas detectados:**
    *   La eliminación de secciones elimina físicamente todos los platos en cascada en la base de datos; si el usuario se equivoca de botón, pierde todo el catálogo y fotos vinculadas sin posibilidad de restauración en el panel. Se requiere implementar una papelera de reciclaje o borrado lógico.

---

## 4. PANEL DE RESTAURANTE — CONFIGURACIÓN DE PERFIL

*   **Ruta/Componente Principal:** `app/admin/profile/components/ProfileUI.tsx` / `ScheduleTab.tsx` / `LocationTab.tsx` / `GeneralTab.tsx`
*   **Propósito:** Formulario de administración de la identidad del negocio. Controla los activos gráficos de la marca, los canales oficiales de contacto, la dirección física geolocalizada en mapa interactivo y los horarios minuciosos de operación semanal por turnos.

### 4.1 Elementos de UI Visibles
*   **Navegador de Pestañas Superior:**
    *   Tres selectores horizontales con estética limpia de micro-interacciones: "Identidad" (ícono `UserIcon`), "Ubicación" (ícono `MapPin`) y "Operación" (ícono `Clock`).
*   **Pestaña de Identidad (General):**
    *   **Portada Principal:** Caja de visualización en ratio panorámico de aspecto 2:1. Permite cargar una imagen de alta resolución que se comprime localmente antes de subirse.
    *   **Logo del Negocio:** Contenedor circular centralizado de aspecto 1:1 para el logotipo.
    *   Input de Nombre del negocio (máximo 50 caracteres) y descripción corta (máximo 200 caracteres) con chips contadores de texto.
    *   Input de Slug de URL: Campo de lectura bloqueado (`readonly`, cursor de prohibición), mostrando la URL inalterable elegida en el onboarding.
    *   **Canales de Contacto:** Checkboxes de activación de WhatsApp y Teléfono. Cada uno abre un input para registrar el número de 9 dígitos de Perú.
    *   Categorías: Chips interactivos para seleccionar hasta 2 categorías principales del negocio.
    *   Tipos de Servicio: Casillas de verificación con checks estilizados para "Delivery", "Mesa" y "Para Llevar".
*   **Pestaña de Ubicación:**
    *   Input de Dirección Física de texto libre (máximo 100 caracteres).
    *   Selectores bloqueados de Ciudad ("San Jacinto") y Región ("Áncash").
    *   **Mapa Estático de Referencia:** Muestra la ubicación actual en el mapa. Al pasar el cursor o pulsar la tarjeta, se despliega una capa oscura con un botón flotante: "Ajustar ubicación exacta".
    *   **Modal de Mapa Interactivo a Pantalla Completa:**
        *   Carga un mapa dinámico con un pin central deslizable.
        *   Botón superior flotante **"Usar mi ubicación"** con ícono `LocateFixed`: Consulta las coordenadas GPS del navegador a través de la Geolocation API para posicionar el mapa de forma automática.
        *   Alerta inferior persistente: Informa en tiempo real la distancia en kilómetros desde el pin del restaurante hasta el centro neurálgico de la localidad.
*   **Pestaña de Operación (Horarios de Atención):**
    *   Botón superior **"Copiar horario de Lunes a todos los días"** con ícono `Copy`: Réplica masiva rápida.
    *   Listado de los 7 días de la semana. Cada día contiene:
        *   Switch de día activo (`isOpen`). Si está apagado, todo el bloque se torna gris opaco al 40% y se desactiva.
        *   Botón interactivo **"+ 2 Turnos" / "- 1 Turno"**: Habilita o deshabilita un segundo rango de horario para el mismo día (útil para restaurantes que cierran por la tarde y vuelven a abrir por la noche).
        *   Inputs de hora de tipo `time` (ej. `08:00`, `15:00`) con soporte para temas oscuros en el selector nativo del navegador.
        *   Etiqueta de advertencia nocturna: Si la hora de cierre es menor que la de apertura (ej. abre 19:00 y cierra 02:00), el sistema renderiza un mensaje sutil: `"(Cierra al día siguiente)"` en color gris a 11px.

### 4.2 Flujo de Acciones Paso a Paso
1.  **Réplica de Horarios en Bloque:**
    El restaurante opera de martes a domingo en el mismo horario $\rightarrow$ El dueño configura minuciosamente el día **Lunes** (ej. Turno 1: 11:30 - 15:00, Turno 2: 18:00 - 22:30) $\rightarrow$ Hace clic en "Copiar horario de Lunes a todos los días" $\rightarrow$ El estado de React clona las estructuras de datos de Lunes en los 6 días restantes $\rightarrow$ El usuario guarda con un solo clic.
2.  **Geolocalización con Límite de Cobertura:**
    El restaurante desea cambiar su punto de despacho $\rightarrow$ Clic en "Ajustar ubicación exacta" $\rightarrow$ Se abre el mapa modal $\rightarrow$ El usuario permite acceso a GPS $\rightarrow$ El pin se mueve al punto exacto $\rightarrow$ **Validación de distancia:** El sistema calcula la distancia Haversine al centro de San Jacinto $\rightarrow$ Si el pin se posiciona a más de 3.0 km del centro (parámetro `MAX_RADIUS_KM` de `MapConstants`), el contenedor alerta en letras rojas llamativas: *"Tu negocio está a X km. Por ahora solo operamos a 3.0km del centro"* $\rightarrow$ **El botón de confirmar se deshabilita por completo**, impidiendo guardar la ubicación fuera de rango.

### 4.3 Estados y Casos Edge
*   **Formato de Telefonía (Server-Side Fix):**
    Los clientes suelen ingresar su número con o sin código de país (ej. `999888777` o `51999888777`). 
    *   **En la Base de Datos:** Se normalizan y guardan con prefijo obligatorio `51` (ej. `51999888777`) para garantizar el funcionamiento de los enlaces dinámicos de WhatsApp.
    *   **En la Interfaz del Panel:** El frontend realiza un formateo inverso para remover el `51` inicial y presentar al dueño un campo limpio de exactamente 9 dígitos.
*   **Colisiones de Horario:**
    Si un restaurante activa "+ 2 Turnos" pero el cierre del primer turno choca con la apertura del segundo (ej. Turno 1 cierra 16:00 y Turno 2 abre 15:30), el frontend:
    1.  Detecta la colisión mediante lógica condicional: `close >= open2`.
    2.  Pinta los bordes de los inputs involucrados en rojo intenso.
    3.  Deshabilita el botón principal "Guardar Horarios".
    4.  Muestra la advertencia superior: *"Corrige los horarios en rojo antes de guardar"*.

### 4.4 Evaluaciones de Producción
*   ✅ **Lo que funcionó bien:**
    *   El indicador nocturno `"(Cierra al día siguiente)"` resolvió todas las confusiones de los restaurantes nocturnos (pollerías y bares) al registrar horarios de madrugada sin alterar el orden lógico de los días de la semana.
    *   La geolocalización asistida por GPS y limitada por geocerca previene que los restaurantes del interior configuren por error ubicaciones predeterminadas de Lima u otras regiones del país.
*   ⚠️ **Limitaciones / Problemas detectados:**
    *   El límite estricto de 3.0 kilómetros de radio de operación está hardcodeado en una constante del cliente (`MAX_RADIUS_KM` en `MapConstants.ts`), impidiendo la autogestión de coberturas personalizadas para restaurantes que cuentan con movilidad propia de largo alcance.

---

## 5. RESUMEN DE PATRONES DE UX Y DECISIONES DE DISEÑO OBSERVABLES

A lo largo de ambos paneles de Tindivo se identifican decisiones de diseño consistentes orientadas a la usabilidad móvil y a la simplicidad operativa en contextos rurales del interior de Perú:

### 5.1 Estética Visual "Sleek Dark Mode" (Tambo Premium)
*   **Paleta de Colores Armónica:** Fondo de pantalla e inputs en negro absoluto (`#0A0A0A`) y gris oscuro carbón (`#121212`, `#1E1E1E`). Color de marca y acento en naranja vibrante (`#FF6600` / `#orange-500`) con un alto contraste y un aire moderno premium (glassmorphism y sombras con brillo). Los colores funcionales son estrictos: Verde esmeralda para estados óptimos y Azul para elementos de información complementaria.
*   **Tipografía Premium:** Uso consistente de tipografías modernas con altos grosores (font-black y font-bold) que jerarquizan los títulos y botones, aportando un aspecto robusto de PWA móvil nativa.

### 5.2 Filosofía de Diseño "Mobile-First"
*   **Área de Contenido Acotada:** El contenedor global limita su ancho máximo a 480px en pantallas grandes o centra los formularios a un máximo de 4xl, garantizando que el diseño mantenga proporciones legibles y de fácil acceso con el dedo pulgar al operarse desde teléfonos celulares de gama media y baja (el dispositivo más común de los comerciantes locales).
*   **Márgenes de Seguridad Inferiores:** Todos los elementos interactivos inferiores (como la barra de selección rápida de menú o botones de submit) heredan la clase `pb-safe`, respetando la barra de navegación nativa de los navegadores de celulares y sistemas operativos.

### 5.3 Tolerancia Táctil de 44x44
*   Siguiendo las pautas de accesibilidad para pantallas táctiles móviles, todos los botones de activación, switches de encendido, botones contextuales y disparadores de dropdowns tienen un área activa mínima de 44x44 píxeles reales, evitando clics accidentales en los menús de configuración del restaurante.

### 5.4 Optimistic UI (Interfaces Sin Fricción)
*   Los conmutadores de estado operativo de la cocina y los switches de visibilidad de los platos cambian visualmente de inmediato al ser pulsados. El usuario no percibe la latencia del viaje de datos al servidor; las llamadas a las server actions ocurren asíncronamente en segundo plano. Si falla la operación de red, el sistema revierte el switch a su estado inicial y arroja una alerta informativa.

### 5.5 Pre-Compresión de Imágenes en Cliente
*   Como decisión arquitectónica clave, las fotos cargadas en el menú o perfil se someten a rutinas de compresión local en el navegador del usuario (`imageCompression.ts`) antes de enviarse al almacenamiento en la nube de Firebase. Esto optimiza el consumo de datos móviles del comerciante, agiliza la velocidad de carga de la web y previene la saturación del espacio de almacenamiento en el servidor de Tindivo.
