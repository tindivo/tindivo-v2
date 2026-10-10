# 0035. Tindivo Entregas abre todos los días, no solo entre semana

Estado: Vigente · 2026-10-10 · Aprobada por Jesús (conversación con Claude Code, 2026-10-10: «entregas es de lunes a
domingo»)

## Contexto

El plan del 30-sep (debate Claude + Codex, nunca aprobado) proponía lanzar Entregas **de lunes a viernes**, para
rellenar los huecos del motorizado entre semana. Mientras tanto se construyó y encendió con otro horario.

## Decisión

**Entregas atiende de lunes a domingo, de 18:00 a 23:00**, a S/ 3 que paga el cliente.

## Alternativas descartadas

- **Solo de lunes a viernes** (plan del 30-sep): pensado para no cruzarse con el fin de semana de comida. Los datos
  del 7-oct mostraron que el fin de semana no está saturado (mediana 23.5 min, igual que entre semana).

## Consecuencias

- El plan del 30-sep queda cerrado. De él siguen vigentes, porque se construyeron así: S/ 3 que paga el cliente, el
  negocio no paga ni es cliente, y la comida preparada no va por Entregas. Se recogen en el canon de Entregas al
  reescribirlo.

## Verificación

- `supabase/migrations/0238_entregas_abre_de_noche_y_avisa_sin_descuentos.sql`: «18:00 a 23:00, de lunes a domingo».
- `tindivo-prod` (`zpnipajgwfthxhdtzhly`), 2026-10-10, solo lectura: `app_settings` clave `courier` →
  `enabled: true`, `hours: {start: "18:00", end: "23:00", days: [1,2,3,4,5,6,7]}`.

Discusión: `8f26aed:Docs/nuevo-modelo/`
