# Arquitectura de `apps/customer`

Este documento define las convenciones del refactor piloto. El objetivo es que cada archivo tenga una única responsabilidad y que ningún componente/página supere las ~300 líneas.

## Estructura de carpetas

```
app/                    # Páginas Next.js (App Router). Solo orquestación.
features/               # Módulos de dominio autocontenidos.
  catalog/              # Home, catálogo de negocio, búsqueda.
  cart/                 # Carrito, hoja de carrito, líneas.
  checkout/             # Flujo completo de checkout.
  tracking/             # Pantalla de seguimiento de pedido.
  onboarding/           # Auth onboarding y gates.
components/             # Componentes transversales locales (reutilizables entre features).
hooks/                  # Hooks transversales.
lib/                    # Utilidades puras, stores y clientes.
```

## Reglas

1. **Máximo 300 líneas** por archivo de componente o página; ideal < 200.
2. **`app/**/page.tsx`** solo orquesta secciones y hace data fetching. No contiene lógica de negocio compleja.
3. **`features/*/hooks/`** encapsula estado, side effects y lógica de dominio.
4. **`features/*/components/`** contiene widgets y secciones de UI.
5. **`lib/`** contiene utilidades puras, stores (Zustand), clientes (Supabase, API) y formateadores.
6. **Componentes atómicos** (botón, input, badge, sheet, etc.) deben vivir en `@tindivo/ui`.
7. **No estilos inline arbitrarios**: usar clases de Tailwind o tokens del theme.
8. **Tipos por feature**: cada feature puede tener su propio `types.ts`.
9. **No acoplar features**: `catalog` no importa hooks de `checkout`, etc. Los datos compartidos pasan por props o stores en `lib/`.

## Import aliases

- `@/features/*` → módulos de dominio.
- `@/components/*` → componentes transversales.
- `@/hooks/*` → hooks transversales.
- `@/lib/*` → utilidades y stores.
- `@tindivo/ui` → design system compartido.

## Cómo agregar una nueva página

1. Crear `app/<ruta>/page.tsx` con solo el layout y data fetching.
2. Crear los componentes necesarios en `features/<dominio>/components/`.
3. Si necesita estado complejo, crear un hook en `features/<dominio>/hooks/`.
4. Reutilizar componentes de `@tindivo/ui` siempre que sea posible.
