# Flujo de Onboarding y Checkout del Cliente (apps/customer)

Este documento detalla el flujo actual de registro, onboarding y checkout en la aplicación del cliente (`apps/customer`), incluyendo componentes de UI, gestión de estado, persistencia y base de datos.

---

## 1. Onboarding (Registro e Inicio de Sesión)

El flujo de onboarding se orquesta mediante un modal tipo Bottom Sheet multipaso que recopila los datos del usuario de forma progresiva.

### Componente Orquestador Principal
*   **Archivo:** [auth-onboarding-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/auth-onboarding-sheet.tsx)
*   **Props/Parámetros:** No recibe props directas. Lee su estado del hook global [useOnboarding](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/lib/onboarding-store.ts) y consulta la sesión activa mediante Supabase Auth.
*   **Orden de Pasos (PANEL_ORDER):**
    1.  `'method'` — Selector de método de inicio (Google o Correo).
    2.  `'email-signup'` — Formulario de registro con correo.
    3.  `'login'` — Formulario de inicio de sesión.
    4.  `'google-name'` — Confirmación de nombre visible (solo tras OAuth de Google).
    5.  `'phone'` — Ingreso de celular de contacto (WhatsApp).
    6.  `'address'` — Captura de ubicación (mapa + dirección + referencia).
*   **Pasos Omitibles (SKIPPABLE):** `['google-name', 'phone', 'address']`. Al omitir, se cierra el sheet guardando la sesión creada.
*   **Condición de Cierre/Finalización:** 
    *   La función `finish()` se dispara cuando se completa el último paso (`address`) o cuando se inicia sesión con éxito en `login`.
    *   Cierra el Bottom Sheet, limpia el resume de OAuth y redirige a la ruta definida en `useOnboarding.next` (si existe).
*   **Lógica de decisión relevante (JSX carrusel):**
    ```typescript
    const idx = Math.max(0, PANEL_ORDER.indexOf(ob.step))
    // ...
    <div
      className="flex h-full"
      style={{
        width: `${PANEL_ORDER.length * 100}%`,
        transform: `translateX(-${(idx * 100) / PANEL_ORDER.length}%)`,
        transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
    ```

---

### Pasos del Onboarding

#### 1. Method Step
*   **Archivo:** [method-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/method-step.tsx)
*   **Props:** 
    *   `onGoogle: () => Promise<void>` — Inicia redirección OAuth de Google.
    *   `onEmail: () => void` — Cambia al panel `'email-signup'`.
    *   `onLogin: () => void` — Cambia al panel `'login'`.
*   **Flujo:** Presenta las opciones de autenticación. Redirige a Google o cambia de tab localmente en el sheet.

#### 2. Email Signup Step
*   **Archivo:** [email-signup-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/email-signup-step.tsx)
*   **Props:**
    *   `active: boolean` — Indica si el panel está visible.
    *   `onDone: (identity: { fullName: string; email: string }) => void` — Callback al crear cuenta.
    *   `onGoToLogin: (email: string) => void` — Callback si el correo ya existe.
*   **Validaciones:**
    *   `fullName` >= 2 caracteres.
    *   `email` cumple expresión regular `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
    *   `password` >= 6 caracteres.
*   **Flujo:** Llama a [signUpWithEmail](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts) en el submit. En caso de éxito, registra términos y el perfil base, luego transiciona al step `phone`.

#### 3. Login Step
*   **Archivo:** [login-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/login-step.tsx)
*   **Props:**
    *   `active: boolean`
    *   `initialEmail?: string | null`
    *   `onDone: () => void`
    *   `onSignup: () => void`
*   **Flujo:** Llama a [signInWithEmail](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts). Al validar credenciales con éxito, cierra el onboarding.

#### 4. Google Name Step
*   **Archivo:** [google-name-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/google-name-step.tsx)
*   **Props:**
    *   `active: boolean`
    *   `initialName: string | null`
    *   `userId: string | null`
    *   `onDone: (fullName: string) => void`
*   **Validaciones:** Nombre >= 2 y <= 40 caracteres, solo letras (`/^[\p{L}\s'.-]+$/u`).
*   **Flujo:** Se muestra al retornar del flujo OAuth de Google para confirmar el nombre que aparecerá en el pedido. Al guardar, llama a [saveGoogleName](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts) y pasa a `phone`.

#### 5. Phone Step (WhatsApp)
*   **Archivo:** [phone-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/phone-step.tsx)
*   **Props:**
    *   `active: boolean`
    *   `fullName: string | null`
    *   `email: string | null`
    *   `userId: string | null`
    *   `onDone: () => void`
*   **Validaciones:** Celular de 9 dígitos que comience con 9 (`/^9\d{8}$/`).
*   **Flujo de datos:** Escribe directamente el número de teléfono en `customer_profiles` llamando a [savePhone](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts). Al completar, llama a `onDone()` que transiciona a `address`.

#### 6. Address Step
*   **Archivo:** [address-step.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/steps/address-step.tsx)
*   **Props:**
    *   `active: boolean`
    *   `userId: string | null`
    *   `onBack: () => void`
    *   `onDone: () => void`
*   **Validaciones:** La referencia debe cumplir el largo mínimo y la posición del mapa debe estar dentro de la zona de reparto (`insideZone === true`).
*   **Flujo de datos:** Envía los datos a [saveAddress](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts). Al guardarse, llama a `onDone()` que finaliza el onboarding.

---

### Gestión de Estado de Onboarding (Zustand)
*   **Archivo:** [onboarding-store.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/lib/onboarding-store.ts)
*   **Exports:**
    *   `type OnboardingStep`
    *   `type OnboardingVariant` ('fresh' | 'google-resume' | 'profile-incomplete')
    *   `type OnboardingPath` ('email' | 'google')
    *   `saveOnboardingResume(next)` / `readOnboardingResume()` / `clearOnboardingResume()` — Persisten el estado de redirección antes de ir a Google OAuth.
    *   `useOnboarding` — Store de Zustand con el estado del modal (abierto/cerrado, paso actual, datos de sesión).

---

### Capa de Persistencia Base de Datos (Onboarding)
*   **Archivo:** [persistence.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts)
*   **Funciones Principales:**
    *   `acceptTerms(userId)`: Inserta un registro en `terms_acceptance`.
    *   `signUpWithEmail(input)`: Ejecuta el registro en Supabase Auth y crea la fila inicial del perfil mediante `upsertProfile`.
    *   `signInWithEmail(input)`: Llama a `signInWithPassword` de Supabase.
    *   `signInWithGoogle()`: Llama a `signInWithOAuth` redirigiendo a `/auth/callback`.
    *   `upsertProfile(input)`: Realiza un SELECT previo y luego INSERT o UPDATE de `customer_profiles` para prevenir race conditions.
    *   `savePhone(input)`: Guarda el celular (9 dígitos) del usuario.
    *   `saveAddress(input)`: Guarda la dirección física en `customer_addresses`, marcando las coordenadas predeterminadas en `customer_profiles.default_coordinates_lat/lng`.
    *   `getProfileStatus(userId)`: Devuelve booleanos `hasProfile`, `hasPhone` y `hasAddress` para reanudar el onboarding en el punto correcto.

---

## 2. Proceso de Checkout (Pasarela de Pedido)

El checkout recolecta la información final del pedido, valida la localización GPS contra fraude de contraentrega, y delega la inserción a un RPC de base de datos.

### Página de Checkout
*   **Archivo:** [checkout/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/checkout/page.tsx)
*   **Estructura de Pasos:** Controlada por el estado local `step` (`'delivery'` | `'payment'`).
*   **Lectura del Perfil de Usuario:**
    Se ejecuta al montar en un `useEffect`. Utiliza Supabase Browser Client para obtener la sesión y leer el perfil:
    ```typescript
    const { data: prof } = await supabase
      .from('customer_profiles')
      .select('full_name,phone,contraentrega_blocked,blocked_until')
      .maybeSingle()
    ```
*   **Campos utilizados:**
    *   `profile.full_name`: Precarga el input de Nombre.
    *   `profile.phone`: Precarga el input de Teléfono (remueve prefijo `+51`).
    *   `profile.contraentrega_blocked`: Si es `true`, fuerza al usuario a usar pago digital (`prepaid`).
    *   `profile.blocked_until`: Valida si el usuario está suspendido temporalmente.

### Flujo de Validación y Creación del Pedido
1.  **goToPayment() (Paso 1 -> Paso 2):**
    *   Valida que el nombre no esté vacío.
    *   Si es delivery, valida que se haya seleccionado una dirección guardada o se haya marcado un punto en el mapa (`manualAddr.coords`) dentro de la zona de cobertura (`manualInside === true`).
    *   Valida la expresión regular del teléfono (`/^9\d{8}$/`).
2.  **placeOrder() (Confirmación final):**
    *   Valida que si se paga con efectivo, el monto a pagar cubra el total (`cashAmount >= total`).
    *   Dispara la función `collectGpsValidation()` para medir el GPS contra fraude (ver abajo).
    *   Si el usuario no tiene dirección guardada, persiste la dirección marcada como "Casa" por defecto llamando a `saveAddress()`.
    *   Llama al endpoint `/customer/orders` (REST API única de Tindivo) para crear el pedido.
3.  **Lógica del GPS Antifraude (`collectGpsValidation`):**
    *   Consulta la configuración geográfica desde `getLocationValidation()`.
    *   Obtiene las coordenadas del cliente mediante `getCurrentPositionHA()`.
    *   Calcula la distancia al centro de San Jacinto mediante `haversineKm()`.
    *   **Reglas de Decisión:**
        *   Si la precisión del GPS (`accuracyM`) supera `maxAccuracyM` (malo) y el pago no es prepago, retorna issue `'low_accuracy'`.
        *   Si la distancia supera `warningRadiusKm` (muy lejos) y el pago no es prepago, retorna issue `'far'`.
        *   Cualquier error de GPS (permiso denegado, etc.) que no sea con método prepago retorna issue `'unavailable'`.
        *   *Nota:* Cualquiera de estos issues bloquea la compra mostrando una pantalla intermedia que le ofrece al usuario pagar por adelantado (Yape/Plin) para poder saltarse la validación GPS.

#### Lógica de creación del pedido en Base de Datos
La API REST llama internamente a la función de Postgres `create_customer_order`, la cual procesa la orden dentro de una transacción atómica:
*   Realiza las comprobaciones de bloqueos (`customer_is_blocked`, `customer_requires_prepayment`).
*   Calcula la distancia geográfica y decide el estado inicial del pedido (si es número nuevo o fuera del radio normal entra a estado `'validando'`).
*   Inserta el pedido en la tabla `orders` e ítems con sus modificadores.

---

### Componente del Carrito (Bolsa de Compra)
*   **Archivo:** [cart-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/cart-sheet.tsx)
*   **Botón de Checkout:** Botón "Ir a pagar" que redirige a `/checkout` mediante `router.push('/checkout')`.
*   **Validaciones del Carrito:**
    *   Utiliza el hook [useBusinessOrdering](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/lib/business-ordering.ts) para consultar de forma fresca el negocio.
    *   **Gating:** Si el negocio está cerrado según su horario semanal (`closed === true`), el botón "Ir a pagar" se deshabilita y se muestra el mensaje *"El restaurante está cerrado ahora"*.
    *   Si el negocio no acepta pedidos por web (modo WhatsApp/Catálogo), renderiza botones que abren la API de WhatsApp con un texto formateado del pedido, en lugar de permitir la redirección al checkout.

---

### Gestión de Estado de Bolsa (Zustand)
*   **Archivo:** [cart.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/lib/cart.ts)
*   **Store:** `useCart` (persistido en localStorage mediante la clave `'tindivo.cart'`).
*   **Estructura:**
    *   `businessId` / `businessName`
    *   `lines` — Array de `CartLine` (contiene key única, unitPrice con modificadores incluidos, modifiers con optionId, y note).
    *   *Nota:* No almacena información del perfil del cliente.

---

## 3. Endpoints de Verificación OTP

La API REST en `apps/api` provee los endpoints para interactuar con Twilio Verify.

### 1. Enviar Código
*   **Ruta:** `/customer/phone/send-code` ([send-code/route.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/customer/phone/send-code/route.ts))
*   **Método:** `POST`
*   **Payload recibido:** `{ phone: string }` (validado mediante `PhonePeSchema` de contratos: 9 dígitos).
*   **Lógica:**
    *   Valida rol `customer`.
    *   Realiza una consulta a la tabla `customer_otp_attempts` para verificar que el usuario no exceda el límite de **3 intentos por 24 horas**.
    *   Llama al SDK de Twilio Verify configurando el canal primario como WhatsApp:
        ```typescript
        const verification = await twilioClient.verify.v2
          .services(VERIFY_SERVICE_SID)
          .verifications.create({
            to: `+51${phone}`,
            channel: 'whatsapp',
            locale: 'es',
          })
        ```
    *   Registra el intento en `customer_otp_attempts`.
*   **Respuesta Exitosa:** `200 OK` `{ sent: true, channel: string }`

### 2. Verificar Código
*   **Ruta:** `/customer/phone/verify` ([verify/route.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/customer/phone/verify/route.ts))
*   **Método:** `POST`
*   **Payload recibido:** `{ phone: string, code: string }` (código de 6 caracteres).
*   **Lógica:**
    *   Llama al SDK de Twilio Verify:
        ```typescript
        const result = await twilioClient.verify.v2
          .services(VERIFY_SERVICE_SID)
          .verificationChecks.create({
            to: `+51${phone}`,
            code,
          })
        ```
    *   Si el resultado es `'approved'`, actualiza el perfil en la base de datos:
        ```typescript
        await service
          .from('customer_profiles')
          .update({
            phone: `+51${phone}`,
            phone_verified_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
        ```
*   **Respuesta Exitosa:** `200 OK` `{ verified: true, phone: string }`

---

## 4. Esquema de Base de Datos Relacionado

Estructuras SQL de las tablas en Supabase.

### Tabla: `customer_profiles`
```sql
CREATE TABLE public.customer_profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    phone text UNIQUE,
    phone_verified_at timestamptz,
    strikes integer DEFAULT 0 NOT NULL,
    contraentrega_blocked boolean DEFAULT false NOT NULL,
    blocked_until timestamptz,
    default_address text,
    default_reference text,
    default_coordinates_lat numeric,
    default_coordinates_lng numeric,
    default_location_accuracy_m integer,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
```

### Tabla: `customer_addresses`
```sql
CREATE TABLE public.customer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label text NOT NULL, -- 'Casa', 'Trabajo', 'Otro'
    line text,
    reference text NOT NULL,
    coordinates_lat numeric,
    coordinates_lng numeric,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
```

### Tabla: `customer_otp_attempts`
```sql
CREATE TABLE public.customer_otp_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone text NOT NULL,
    sent_at timestamptz DEFAULT now() NOT NULL
);

-- Índice para optimizar el conteo de la ventana de 24h
CREATE INDEX idx_otp_attempts_user_24h ON public.customer_otp_attempts(user_id, sent_at);
```

---

## 5. Validación Geográfica / Cobertura

### 1. [coverage.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/lib/coverage.ts)
*   **getCoverage()**: Consulta la configuración `'coverage'` en `app_settings` (retorna latitud, longitud y radio en Km).
*   **getCoveragePolygon()**: Consulta `'coverage_polygon'` en `app_settings` (retorna un array de vértices LatLng).
*   **pointInPolygon(point, ring)**: Aplica algoritmo de *ray-casting* para validar si la coordenada se encuentra dentro del polígono delimitado.
*   **haversineKm(a, b)**: Calcula la distancia lineal entre dos puntos utilizando la fórmula de Haversine.

### 2. [address-fields.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/address-fields.tsx)
*   Componente de formulario que encapsula la selección del mapa. Recibe `onValidityChange` el cual reporta si la dirección está dentro de la cobertura para deshabilitar o habilitar el envío del formulario.

### 3. [map-picker.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/components/map-picker.tsx)
*   Mapea visualmente la zona de cobertura. Si existe un polígono configurado, lo dibuja; de lo contrario dibuja un círculo con el radio y centro obtenido.
*   El botón *"Usar mi ubicación"* utiliza `getCurrentPositionHA()` de `lib/geolocation.ts` que consulta el GPS del dispositivo con un timeout máximo, capturando la latitud, longitud y precisión (`accuracyM`).
