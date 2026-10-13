# 0039. El backend es un paquete y la API es su interfaz REST

Estado: Vigente · 2026-10-12 · Aprobada por Jesús el 2026-10-12 (conversación con Claude Code)

## Contexto

- `apps/api` es el backend de Tindivo: una app de Next.js que expone rutas propias con carpetas (`app/**/route.ts`).
- Al aplicar los estándares hubo que decidir dónde viven los módulos de negocio. La opción de menor movimiento era dejarlos dentro de `apps/api` (`apps/api/modules/<m>/`).
- El backend debe poder salir de Next.js por partes y, a largo plazo, separar módulos en servicios (`Docs/planes/movil/` y los estándares v2.2).

## Decisión

- **La lógica vive en `packages/backend`** (nombre de paquete `@tindivo/backend`, con el scope que ya usan los paquetes del repo): módulos con `domain/`, `application/`, `infra/` y `http/`, más la raíz de composición. No depende de Next.js (DES-9).
- **Los handlers usan la API Fetch estándar**: reciben `Request` y los parámetros de ruta y devuelven `Response`. Se construyen con `defineHandler` (TS-17), que declara método, ruta, autenticación y esquemas.
- **`apps/api` es solo la interfaz REST**: cada archivo de ruta enlaza un handler con `toNextRoute`. Sigue siendo el desplegable, con su dominio propio (DA-02), y conserva el prefijo actual de sus rutas.
- **Solo el desplegable de la API importa `packages/backend`**; las apps cliente hablan con la API por HTTP (DES-1, DES-11).
- **`packages/core` se queda con lo que comparten las apps web.** Lo que contenga reglas de negocio que necesitan garantía de servidor migra a `packages/backend` cuando se toque.
- **El código existente se mueve cuando se toca.** Mientras tanto, las rutas con lógica se registran en `Docs/arquitectura/excepciones.md` (DES-3).

## Alternativas

- **Módulos dentro de `apps/api`**: el menor movimiento hoy. Descartada: la frontera con Next.js quedaría solo en una regla de lint, y salir de Next.js obligaría a mover todos los módulos más adelante, con más código.
- **Un servicio desplegable aparte (`tindivo-backend`) detrás de `apps/api`**: descartada por ahora. Serían dos despliegues y un salto de red por petición, sin ganancia hoy. Cuando se salga de Next.js, el servidor nuevo reemplaza a `apps/api` importando el mismo paquete.
- **Hono como router desde ya**: aplazada (DA-03). Como los handlers son Fetch API y declaran su método y ruta, el router se puede cambiar, o generar, sin tocar `packages/backend`.

## Consecuencias

- Salir de Next.js es montar los mismos handlers en un servidor nuevo que importa `packages/backend`, y apuntar a él el dominio de la API (DA-02).
- Un módulo con tablas propias (DES-7) puede convertirse en servicio llevándose su carpeta.
- `apps/api` compila el paquete con la opción `transpilePackages` de Next.js (`apps/api/next.config.ts` ya lo usa para `@tindivo/contracts`, `@tindivo/core` y `@tindivo/supabase`).
- Un test mantiene enlazadas las carpetas de rutas de `apps/api` con el método y la ruta que declara cada handler.

## Verificación

- `dependency-cruiser`: ninguna app cliente importa `packages/backend`, y `packages/backend` no importa `next`.
- El test de enlace de rutas corre en CI.

Discusión: chat de Jesús con Claude del 2026-10-12, fuera del repo; este ADR recoge lo decidido.
