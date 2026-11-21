---
id: web-publica
nombre: Web pública de tindivo.com
actores: [CUS]
lineas: [pedidos-restaurante, entregas, store]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/app/terminos/page.tsx, apps/customer/app/privacidad/page.tsx]
  android: []
  ios: []
  backend: []
operaciones: []
reglas: []
---

# Web pública de tindivo.com

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — SPEC sin código: `apps/web` no existe todavía; pendiente de su visto bueno

## Antes de tocar

- Es la cara pública de Tindivo: una **app nueva `apps/web`**, Next 16 con `output: 'export'` (estática), que reemplaza a la web del cliente. La web del cliente (`apps/customer`) se apaga (D-27) y **no se arregla nada en ella** (decisión de Jesús, 2026-11-19).
- Mismos tokens y letra Geist que la app: primario #EE6417, texto naranja #C2410C, tinta #2E3236, página #F7F8FA, tarjetas blancas; blanco sobre naranja solo desde 18 px en negrita; toque mínimo 48 px.
- Páginas: landing, `/terminos`, `/privacidad`, `/libro-de-reclamaciones` y `/borrar-cuenta` (Google Play exige esta última URL). El Libro tiene su propia capacidad: `libro-reclamaciones`.
- Soporte por WhatsApp: **un solo número, 51906550166**, el mismo de la capacidad de soporte. La landing no escribe ningún otro.
- Alojamiento: el proyecto de Vercel que hoy sirve `tindivo.com` (el dominio no se mueve); se despliega en cada push, sin «Ignored Build Step» (una base manipulable podría saltarse un cambio legal).
- **La tienda web sigue viva hasta que salgan Android e iOS.** Hasta entonces conviven; el corte es un cambio aparte, con su propio PR. Al cortar, los enlaces viejos (`/negocio/*`, `/pedido/*`, `/store`, etc.) redirigen a la landing: nunca 404.
- Términos y Privacidad: se publica el texto vigente hoy (el de `apps/customer/app/terminos` y `/privacidad`) y se reemplaza cuando Jesús apruebe la v2 (PR #194). Una sola fuente en markdown versionado (ver CUS-WPU-006).
- Ninguna página depende de sesión, de la API ni de cookies. La excepción es el formulario del Libro, que vive en su capacidad.
- `dinero: false`. Si la landing llega a mostrar tarifas o precios, esta capacidad pasa a `dinero: true` y entra Codex.
- iOS aún no empieza: `codigo.ios` vacío. `codigo.web` apunta hoy al texto legal de `apps/customer`; cuando nazca `apps/web`, se reemplaza por sus globs.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-WPU-001 | La web pública debe ser una app estática (`output: 'export'`) en `apps/web`, sin servidor propio y sin depender de sesión. | Decisión de Jesús, 2026-11-19 · `movil:D-27` | ★ |
| CUS-WPU-002 | La landing debe explicar en pocas líneas qué es Tindivo y ofrecer bajar la app de Google Play; el botón de App Store aparece solo cuando la app exista en esa tienda. | Decisión de Jesús, 2026-11-19 | |
| CUS-WPU-003 | La landing debe ofrecer un botón de WhatsApp de soporte con el número único `51906550166`, que abre el chat con un mensaje prellenado y revisable. | Decisión de Jesús, 2026-11-19 · capacidad `soporte` | |
| CUS-WPU-004 | La web debe publicar `/terminos` y `/privacidad` con el texto vigente, mostrando su versión y su fecha. | Decisión de Jesús, 2026-11-19 | ★ |
| CUS-WPU-005 | La web debe publicar `/borrar-cuenta`, que explica cómo borrar la cuenta desde la app y cómo pedirlo por WhatsApp, sin pedir inicio de sesión. | Requisito de Google Play (URL de eliminación de cuenta) · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-WPU-006 | Los Términos y la Privacidad deben vivir en un markdown versionado en el repo (con versión y fecha en su cabecera), del que la web renderiza al compilar y del que la app nativa toma su texto, abriendo la URL o empaquetándolo. No debe existir una segunda copia escrita a mano. | Decisión de Jesús, 2026-11-19 · `app_settings:terms_version` | |
| CUS-WPU-007 | La web debe publicar `/libro-de-reclamaciones`; el formulario y sus reglas están en la capacidad `libro-reclamaciones`. | Decisión de Jesús, 2026-11-19 | |
| CUS-WPU-008 | Cuando se apague la tienda web, toda ruta vieja (`/negocio/*`, `/pedido/*`, `/store` y las demás de `apps/customer`) debe redirigir a la landing; ninguna puede responder 404. | Decisión de Jesús, 2026-11-19 · `movil:D-27` | ★ |
| CUS-WPU-009 | Cada página debe verse y usarse bien desde 360 px de ancho, con toques de al menos 48 px y texto naranja solo con el tono #C2410C. | Decisión de Jesús, 2026-11-19 | |
| CUS-WPU-010 | Cada página debe cumplir accesibilidad: puntaje de accesibilidad de Lighthouse de al menos 95 (el repo no tiene umbral propio). | Decisión de Jesús, 2026-11-19 | |
| CUS-WPU-011 | La web debe desplegarse en el proyecto de Vercel actual de `tindivo.com` en cada push, sin «Ignored Build Step»: una base manipulable podría saltarse un cambio legal. | Decisión de Jesús, 2026-11-19; ajustada el 2026-11-20 (Vercel Pro y auditoría de Codex) | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-WPU-01 | Dado el export estático de `apps/web`, cuando se lista el resultado, entonces existen `index.html`, `terminos`, `privacidad`, `libro-de-reclamaciones` y `borrar-cuenta`, y cada URL responde 200 al servirlo. | CUS-WPU-001, CUS-WPU-004, CUS-WPU-005, CUS-WPU-007 |
| CA-WPU-02 | Dado cualquier página del export, cuando se abre sin sesión y con las cookies bloqueadas, entonces se muestra completa y no hace llamadas a la API (salvo el envío del Libro). | CUS-WPU-001 |
| CA-WPU-03 | Dada la landing, entonces tiene el botón de Google Play y el botón de WhatsApp con `wa.me/51906550166`, y ninguna otra cadena de teléfono. El botón de App Store no aparece mientras no haya enlace. | CUS-WPU-002, CUS-WPU-003 |
| CA-WPU-04 | Dado el markdown de Términos con su versión y fecha, cuando se compila la web, entonces `/terminos` muestra esa versión y esa fecha, y el texto es el del markdown. | CUS-WPU-004, CUS-WPU-006 |
| CA-WPU-05 | Dado `/borrar-cuenta`, entonces describe el camino dentro de la app y el camino por WhatsApp, y se abre sin iniciar sesión. | CUS-WPU-005 |
| CA-WPU-06 | Dada la versión de los Términos en el markdown y `app_settings:terms_version`, cuando difieren, entonces una prueba falla en CI (la app no pide reaceptar una versión que la web no publica). | CUS-WPU-006 |
| CA-WPU-07 | Dado el corte de la tienda web, cuando se pide `/negocio/cualquiera`, `/pedido/cualquiera` o `/store`, entonces la respuesta es una redirección a la landing y no un 404. | CUS-WPU-008 |
| CA-WPU-08 | Dado un ancho de 360 px, cuando se recorre cada página, entonces no hay desplazamiento horizontal y todo control mide al menos 48 px. | CUS-WPU-009 |
| CA-WPU-09 | Dada cada página, cuando se corre Lighthouse, entonces la accesibilidad es de al menos 95. | CUS-WPU-010 |
| CA-WPU-10 | Dado cualquier push a la rama de producción, cuando Vercel lo recibe, entonces despliega `tindivo.com` (el `vercel.json` no declara `ignoreCommand`). | CUS-WPU-011 |

## Matriz de paridad

| Plataforma | Papel | Estado |
|---|---|---|
| Backend | Sin cambios (solo el Libro, en su capacidad) | no aplica |
| Web pública (`apps/web`) | Landing, Términos, Privacidad, Libro, borrar cuenta | por construir |
| Android | Abre Términos, Privacidad, Libro y borrar cuenta por URL | enlaces por hacer |
| iOS | Igual que Android | sin empezar |
| Admin, negocios, motorizados | No aplica | no aplica |

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-WPU-006 | Hoy los Términos y la Privacidad están escritos dentro de componentes de `apps/customer` (arreglos de texto en TSX); no hay markdown versionado. | `apps/customer/app/terminos/page.tsx` · `apps/customer/app/privacidad/page.tsx` |

## Por verificar y preguntas

- **Dónde vive el markdown legal.** Propuesta: un paquete `packages/legal/` con `terminos.md` y `privacidad.md` (cabecera con `version` y `fecha`); `apps/web` los importa al compilar y las apps nativas los empaquetan en su build o abren la URL. Alternativa: `apps/web/content/`, más simple pero ata a las apps nativas a una carpeta de otra app. No es canon (es texto de producto, no regla): queda fuera de `Docs/`. Decide Jesús.
- Umbral de Lighthouse: se usa 95 por mandato; si el repo adopta otro, manda ese.
- Texto vigente de Términos y Privacidad: se publica tal cual; la v2 (PR #194) lo reemplaza cuando Jesús la apruebe.
