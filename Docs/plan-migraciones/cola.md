# Cola de lotes

> La sesión de trabajo toma de aquí **el primer lote A desbloqueado**, de arriba abajo. Al cerrar un lote se marca
> `[x]` con el commit o PR y se anota en la bitácora del día (`bitacora/AAAA-MM-DD.md`). Las reglas son las de
> [`plan-diario.md`](plan-diario.md) §2; el detalle de cada lote, en su §4.

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado (con quién o qué lo desbloquea).

## Fase 0 · Cimientos

- [x] **P0.1** · Commit de `Docs/arquitectura/`, `Docs/plan-migraciones/`, esta cola y la bitácora — aprobado por Jesús el 2026-10-09
- [~] **P0.2** · Inventario de rojos heredados en `develop` limpio (`lint`, `check:ds`, `type-check`, `test --force`)
- [ ] **P0.4** · Entorno autónomo: bloqueos de §2.2 en `.claude/settings`, candado de la base local, `.env` sin secretos de prod
- [ ] **P0.3** · Job de integración en CI (Supabase fijado, `db reset` + `db:seed:e2e` + suite de la API con `--force`)
- [!] **P0.5** · Copia de prod fuera del PC — **Jesús**: dónde se guarda, y presencia para sacarla (nivel B + C)
- [!] **P0.6** · Restauración aislada y conciliación — espera a P0.5
- [ ] **P0.7** · Recorrido e2e real del comprobante (sin `UPDATE` simulado)

## Fase 1 · Paso 0

- [!] **C1** · Revocar `expire_courier_orders()` a clientes — escribir y probar en local es A; desplegar espera a P0.5 y a Jesús
- [ ] **C2** · Comprobante (a): `UPDATE` condicionado y 409
- [ ] **C3a-d** · Comprobante (b), transaccional
- [ ] **C4a-d** · Idempotencia (c)
- [!] **C5** · Límites del bucket — **Jesús**: D-40 (formatos y tamaño del comprobante)
- [!] **C6** · Despliegue de C2-C5 — nivel B
- [!] **C7** · Una semana de observación

## Lo que espera a Jesús

1. **P0.5** · Dónde guardar la copia de producción fuera del PC.
2. **D-40** · Formatos y tamaño máximo del comprobante.
3. **H8** · Presupuesto del VPS de ensayo.
