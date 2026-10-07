Los cuatro cambios quedan resueltos, pero encontré dos errores en los ajustes extra. Revisé el diff y reproducciones en memoria; no reejecuté las suites reportadas.

1. **RESUELTO — Caché por usuario.** Al cambiar de A a B devuelve identidad y dirección de B, sin reutilizar el contexto de A (`lib/flow-context.ts:130`).
2. **RESUELTO — Foco.** El hook excluye descendientes de `[inert]` y elegir un resultado también devuelve foco a la lupa (`packages/ui/src/primitives/use-dialog-focus.ts:68`; `map/pin-drop-overlay.tsx:442`).
3. **RESUELTO — Deduplicación.** Exige proximidad y coincidencia de celular o referencia; las dos casas vecinas con contactos distintos ahora permanecen (`lib/routes.ts:64`).
4. **RESUELTO — «Completar».** Solo anuncia deshabilitado durante el envío; el e2e usa un clic normal (`components/trip-details-sheet.tsx:268`).

**Errores encontrados en los extras:**

- **Precarga desde negocio sin contacto.** [use-courier-request.ts:59](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/hooks/use-courier-request.ts:59) obtiene la dirección del contexto, pero usa `identity` del render anterior. Reproduje dirección completa con nombre y celular vacíos; al llegar la identidad, la guarda de coordenadas impide corregirlos. Usar también la identidad devuelta por esa misma promesa.
- **El aviso de fallo no cubre errores normales de Supabase.** [flow-context.ts:75](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/flow-context.ts:75) ignora `error` y devuelve `[]`. La promesa resuelve y `flowFailed` no se activa. Propagar los errores de las consultas para distinguir fallo de historial vacío.

**Veredicto: NO.** Corregir estos dos puntos antes del commit; los cuatro bloqueos anteriores sí quedaron cerrados.