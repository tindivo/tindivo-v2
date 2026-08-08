# Plan de migración del design system Tindivo

> **Documento histórico.** Registra las decisiones de la migración; no describe el
> estado actual. Las menciones a `Docs/06-ui-design-system.md` son de contexto: ese
> fichero se eliminó por llevar tiempo desviado del código. La fuente de verdad hoy
> son los tokens de `packages/ui/src/theme.css` y el uso real en `apps/motorizados`.

> Objetivo: unificar la identidad visual de `apps/customer` y `apps/motorizados` bajo un solo design system coherente, inspirado en la claridad y coherencia de Apple, sin perder el tono cercano de Tindivo.

## Fases aprobadas

1. **Fase 0 — Foundation en `packages/ui`**
2. **Fase 1 — Migrar `apps/motorizados`**
3. **Fase 2 — Migrar `apps/customer`**
4. **Fase 3 — QA visual con Playwright**

---

## Decisiones de diseño aprobadas

### Tipografía

- **Fuente única para display/body/labels:** Geist (Next.js font).
- **Fuente técnica (IDs, precios, tiempos):** JetBrains Mono.
- **Eliminar:** Bricolage Grotesque.
- **Razón:** Geist es más cercana al look moderno/Apple que Manrope (especificada originalmente en `Docs/06-ui-design-system.md`), manteniendo legibilidad en móvil.

### Estructura de `packages/ui`

```
packages/ui/src/
├── primitives/     # átomos sin lógica de negocio
├── patterns/       # composiciones de dominio Tindivo
├── lib/            # utilidades (cn)
├── theme.css       # tokens de color, tipografía, sombras, motion
├── components.css  # clases legacy a migrar (objetivo: eliminar)
├── index.ts        # exporta todo
└── push.ts         # helpers de push
```

### Tokens de color

Unificar `theme.css` con `Docs/06-ui-design-system.md`. Fuente de verdad final: `theme.css`, documentación actualizada después.

| Token | Valor final | Uso |
|---|---|---|
| `--color-brand` | `#F97316` | CTA primary, acentos |
| `--color-brand-dark` | `#C2410C` | hover/active |
| `--color-brand-light` | `#FED7AA` | fondos suaves |
| `--color-ink` | `#1A1614` | texto principal |
| `--color-ink-muted` | `#57534E` | texto secundario |
| `--color-ink-subtle` | `#A8A29E` | placeholders, disabled |
| `--color-surface` | `#FAF6F1` | fondo de páginas |
| `--color-card` | `#FFFFFF` | cards |
| `--color-border` | `#EAE7E2` | bordes |
| `--color-success` | `#16A34A` | éxito |
| `--color-warning` | `#F59E0B` | advertencia |
| `--color-danger` | `#DC2626` | error/destructivo |
| `--color-info` | `#0EA5E9` | info |

---

## Fase 0 — Foundation en `packages/ui`

### 0.1 Reestructurar carpetas

Mover componentes actuales a la estructura aprobada:

**Primitives (átomos):**
- `button.tsx`
- `card.tsx`
- `badge.tsx`
- `icon.tsx`
- `icon-button.tsx`
- `skeleton.tsx`
- `sheet.tsx` (BottomSheet)
- `toast.tsx`

**Patterns (composiciones):**
- `screen-header.tsx`
- `bottom-action-bar.tsx`
- `empty-state.tsx`
- `status-pill.tsx`
- `segmented.tsx`
- `glass-top-bar.tsx`
- `color-dot.tsx`
- `amount.tsx`
- `env-banner.tsx`
- `bottom-nav.tsx` (unificado desde customer + motorizados)
- `toggle-switch.tsx` (desde motorizados)

### 0.2 Unificar tipografía

- Actualizar `theme.css` para que `--font-display`, `--font-sans` apunten a Geist.
- Mantener `--font-mono` para JetBrains Mono.
- Actualizar `apps/customer/app/layout.tsx` y `apps/motorizados/app/layout.tsx` para cargar solo Geist + JetBrains Mono.
- ~~Actualizar `Docs/06-ui-design-system.md` para reflejar la decisión.~~ → el fichero se eliminó; la decisión vive en `theme.css`.

### 0.3 Unificar tokens de color

- Ajustar valores en `theme.css` a la tabla aprobada.
- Verificar contraste y usos en componentes.

### 0.4 Migrar/eliminar clases `.t-*`

- `.t-btn*` → usar `<Button />`.
- `.t-card` → usar `<Card />`.
- `.t-chip` → crear `<Chip />` primitive o usar `<Badge />`.
- `.t-field*` → crear primitives `<Input />`, `<Textarea />`, `<Label />`.
- `.t-qty` → crear `<QuantityStepper />` pattern.
- `.t-ph-image` → mover `ProductImage` a patterns si se usa en 2+ apps.
- `.t-section-tabs` → evaluar si reemplazar por tabs nativas o pattern.
- `.t-sticky-cta` → usar `<BottomActionBar />`.
- `.t-modal-*` → usar `<BottomSheet />`.
- `.t-glass`, `.t-glass-strong` → usar tokens de glass o `<GlassTopBar />`.
- `.t-lift`, `.t-glow-*` → convertir a utilidades Tailwind o tokens.

**Objetivo final:** eliminar `components.css` una vez todas las apps dejen de depender de él.

### 0.5 Exportar nuevos componentes

Actualizar `packages/ui/src/index.ts` para reflejar la nueva estructura.

---

## Fase 1 — Migrar `apps/motorizados`

### 1.1 Actualizar layout

- Cambiar fuentes a Geist + JetBrains Mono.
- Revisar imports de `@tindivo/ui`.

### 1.2 Reemplazar `BottomNav` local

- Usar `<BottomNav />` compartido desde `@tindivo/ui`.

### 1.3 Reemplazar `ToggleSwitch` local

- Usar `<ToggleSwitch />` compartido desde `@tindivo/ui`.

### 1.4 Eliminar estilos inline y clases `.t-*`

- Revisar cada componente y reemplazar por tokens/primitives/patterns.

### 1.5 Verificar consistencia visual

- Botones, cards, badges, estados vacíos, headers, sheets.

---

## Fase 2 — Migrar `apps/customer`

### 2.1 Actualizar layout

- Cambiar fuentes a Geist + JetBrains Mono.
- Revisar imports de `@tindivo/ui`.

### 2.2 Eliminar wrapper `components/ui.tsx`

- Importar directamente desde `@tindivo/ui`.
- Mover `SupportLink` y `ProductImage` a `features/` o `packages/ui/patterns/` según uso.

### 2.3 Reemplazar `BottomNav` local

- Usar `<BottomNav />` compartido desde `@tindivo/ui`.

### 2.4 Eliminar estilos inline y clases `.t-*`

- Esta app tiene ~92 archivos con clases `.t-*`; es la fase más pesada.

### 2.5 Verificar consistencia visual

- Home, negocio, carrito, checkout, tracking, cuenta.

---

## Fase 3 — QA visual con Playwright

### 3.1 Ejecutar tests existentes

```bash
pnpm test:e2e
```

### 3.2 Smoke visual

- Verificar que no haya pantallas rotas.
- Verificar contraste, espaciado, fuentes.

### 3.3 Actualizar Graphify

```bash
pnpm graphify:update
```

---

## Checklist de éxito

- [ ] `packages/ui` tiene carpetas `primitives/` y `patterns/`.
- [x] Todos los layouts frontend cargan solo Geist + JetBrains Mono. → las cuatro apps,
      incluidas `admin` (cargaba Manrope) y `negocios`, que quedaban fuera de este plan.
- [x] ~~`theme.css` y `Docs/06-ui-design-system.md` coinciden en tokens.~~ → `theme.css` es la única fuente; el doc se eliminó.
- [ ] No quedan clases `.t-*` en `apps/customer` ni `apps/motorizados`.
- [ ] `BottomNav` y `ToggleSwitch` son compartidos.
- [ ] `apps/customer/components/ui.tsx` wrapper fue eliminado.
- [ ] `pnpm lint` pasa.
- [ ] `pnpm type-check` pasa.
- [ ] `pnpm test:e2e` pasa o los cambios se justifican.
