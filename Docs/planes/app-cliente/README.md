# App cliente — especificación funcional (Android e iOS, juntos)

> Estado: **propuesto**, pendiente de aprobación de Jesús en su PR · Commit de referencia: `0d0f7486` (develop)
> Alcance: qué hace la app cliente nativa, pantalla por pantalla, independiente de la plataforma; lo que Android ya
> implementa y lo que iOS deberá replicar. **Android e iOS se lanzan juntos, en la misma fecha** (decisión de Jesús, 2026-11-17) · Criterios de aceptación: cada requisito ★ tiene escenarios Dado/Cuando/Entonces
> y cada pantalla enlaza sus requisitos, su flujo y sus endpoints.

## Para qué existe

Hasta hoy la app se definía por pantallas sueltas (canvas), conversaciones y el código. Eso no basta para programar
sin dar vueltas ni para que iOS haga **lo mismo** que Android. Esta carpeta es la fuente única de **qué** hace la app
cliente. El **cómo** está en el código; las **reglas del negocio** y su porqué, en el canon (`Docs/negocio/`).

Quien programa una pantalla en Android o iOS lee, en este orden: su archivo en `pantallas/`, los requisitos que cita,
el flujo donde vive y el contrato REST. Si algo no está aquí, se pregunta; no se copia del otro cliente.

## Lanzamiento conjunto de Android e iOS

Decisión de Jesús, 2026-11-17: las dos plataformas salen **juntas, en la misma fecha**. Consecuencias para esta spec:

- Ninguna decisión se congela mirando solo a Android: lo que cambia lo que la persona ve o puede hacer se anota aquí para las dos.
- **La paridad se asegura con vectores de conformidad:** archivos JSON agnósticos de lenguaje junto a `packages/contracts` (`packages/contracts/fixtures/`), que consumen las pruebas del servidor, de Kotlin y de Swift; se escriben desde las decisiones aprobadas y el REST v1, no ejecutando el código que se quiere comprobar. **Hoy no existen y hay que crearlos** (`Docs/arquitectura/apps-nativas.md` §8). Regla de PR: todo cambio de regla actualiza los vectores y se verifica en servidor, Android e iOS.
- **Recortes del lanzamiento:** Store, promociones y traslado de celular. No se recorta seguridad, reglas de dinero, soporte, legibilidad ni controles táctiles, ni la compatibilidad del REST v1.
- La fecha la fija Jesús según la ruta más larga (iOS no ha empezado y hay dos revisiones de tienda): ver `decisiones-abiertas.md`, punto Z.

## Estructura

```
planes/app-cliente/
├── README.md                ← este archivo: cómo se usa y cómo se mantiene
├── requisitos/              ← QUÉ debe hacer (EARS, IDs estables CUS-<ÁREA>-NNN)
│   ├── AUT.md  acceso, términos, perfil, celular
│   ├── CAT.md  catálogo y negocio        ├── CRT.md  bolsa
│   ├── ADR.md  direcciones y mapa        ├── CHK.md  confirmar pedido
│   ├── PAY.md  pago y comprobante        ├── TRK.md  seguimiento
│   ├── ORD.md  mis pedidos               ├── REV.md  reseñas
│   ├── ACC.md  cuenta                    ├── NOT.md  notificaciones
│   ├── SUP.md  soporte y legal           ├── ENT.md  Tindivo Entregas
│   └── STO.md  Tindivo Store
├── flujos/                  ← EN QUÉ ORDEN: recorridos con diagrama, puertas de entrada y estados de la persona
│   ├── acceso-y-datos.md    ├── pedir.md    ├── pagar.md    ├── seguir.md    └── cuenta.md
├── pantallas/               ← CÓMO SE VE: una por pantalla u hoja, con estados, textos, acciones y endpoints
├── decisiones-abiertas.md   ← lo que Jesús aún no decide, con alternativas y recomendación
└── matriz.md                ← trazabilidad: requisito → pantalla → endpoint → Android → iOS → prueba
```

Lo transversal vive fuera, para que lo compartan todas las apps:

| Qué | Dónde |
|---|---|
| Reglas del negocio (confianza y pago, faltas, plazos, términos) | `Docs/negocio/` (canon) |
| Marca y principios de diseño (minimalismo, pago con Yape o Plin) | `Docs/negocio/diseno.md` (canon) |
| Tokens y componentes (color, tipografía, radios, sombras) y lo que difiere hoy en Android | `Docs/arquitectura/sistema-de-diseno.md` (canon) |
| Reglas del servidor que hereda toda app (estados, plazos, errores, avisos) | `Docs/trabajo/movil/03-requisitos/SYS-transversal.md` → se promueve a `planes/` cuando se apruebe |
| Contrato REST (rutas, códigos, cabeceras, formas) | `Docs/planes/movil/contrato-rest.md` |
| Estructura del código nativo (capas, una carpeta por área) | `Docs/arquitectura/apps-nativas.md` |

## Una sola taxonomía para todo

El **código de área** es el mismo en los requisitos, las pantallas, la carpeta del código y las pruebas. Así se
encuentra cualquier cosa sin buscar:

| Área | Requisitos | Pantallas (prefijo) | Android `feature/` | iOS `Features/` |
|---|---|---|---|---|
| AUT | `requisitos/AUT.md` | `AUT-*` | `signin`, `profile`, `phone` | `Auth` |
| CAT | `CAT.md` | `CAT-*` | `catalog` | `Catalog` |
| CRT | `CRT.md` | `CRT-*` | `cart` | `Cart` |
| ADR | `ADR.md` | `ADR-*` | `addresses` | `Addresses` |
| CHK | `CHK.md` | `CHK-*` | `checkout` | `Checkout` |
| PAY | `PAY.md` | `PAY-*` | `orders` (pago) | `Payment` |
| TRK | `TRK.md` | `TRK-*` | `orders` (seguimiento) | `Tracking` |
| ORD | `ORD.md` | `ORD-*` | `orders` | `Orders` |
| REV | `REV.md` | `REV-*` | `reviews` | `Reviews` |
| ACC | `ACC.md` | `ACC-*` | `account`, `deleteaccount` | `Account` |
| NOT | `NOT.md` | `NOT-*` | (por crear) | `Notifications` |
| SUP | `SUP.md` | `SUP-*` | `account` | `Support` |
| ENT | `ENT.md` | `ENT-*` | `courier` | `Courier` |
| STO | `STO.md` | `STO-*` | `store` | `Store` |

Las carpetas de Android que hoy mezclan áreas (`orders`) no se renombran por esta tabla: se anota y se decide aparte.

## Formato

- **Requisitos:** el de `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` (EARS, ★, ⚙, Fuente), con una
  diferencia: la columna `Est.` se parte en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer ·
  — no aplica). Los IDs existentes se conservan; los nuevos siguen la numeración del área.
- **Pantallas:** plantilla en `pantallas/_plantilla.md`; el piloto es `pantallas/CHK-confirmar-pedido.md`.
- **Flujos:** diagrama Mermaid + tabla «puerta × estado de la persona → qué ve → adónde vuelve».
- Textos de interfaz **exactos** entre comillas latinas «…». Montos y plazos: el parámetro ⚙ de `app_settings`, nunca el
  número suelto.

## Cómo se mantiene (regla para todo PR de la app)

1. Un PR que cambia el comportamiento de la app cliente cambia aquí el requisito o la pantalla **en el mismo PR**
   (`Impacto documental:` en la descripción). Si la doc y el código no coinciden y nadie decidió el cambio, se
   pregunta a Jesús (estándar §4).
2. Al implementar en una plataforma, se actualiza su columna de estado y la `matriz.md`.
3. Una decisión nueva de Jesús se anota en el requisito con su fecha; si es duradera y de negocio, también en el canon.
4. Lo que se decide y aún no se diseña va a `decisiones-abiertas.md`, nunca a un comentario suelto.

## Origen

Consolida `Docs/trabajo/movil/03-requisitos/CUS-cliente.md` (catálogo de 140 requisitos, 2026-10), las decisiones de
Jesús del 16 y 17 de noviembre de 2026 (rediseño v3) y las maquetas del canvas «Tindivo app — pantallas». Al aprobarse,
`CUS-cliente.md` se reemplaza por un puntero a esta carpeta.
