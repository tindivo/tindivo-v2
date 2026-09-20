# 05. Precio, promociones, economía y métricas

> Lee primero `00-maestro.md`. **Todos los valores de este documento van en configuración editable** (panel admin o archivo de configuración), no hardcodeados. Jesús cambiará precios y promos varias veces mientras prueba.

## 1. Precio

| Concepto | Valor | Estado |
|---|---|---|
| Recojo / Envío, tarifa base | **S/3** (paga solo el usuario) | Decidido |
| Alternativa a probar | S/3.50 | [POR CONFIRMAR] tras 2 semanas de datos |
| Negociación de precio (+S/0.50 por paso) | No en v1 | Backlog |
| Pedidos de partners (referencia, no se toca aquí) | Restaurante S/1.50 + usuario S/2–2.50 | Sistema aparte |

**Razones de S/3:** es lo que los usuarios ya pagan por encargos, no introduce un precio nuevo y baja la barrera de entrada. El problema es de volumen, no de margen: con 20 viajes al día, S/0.50 de diferencia son S/10.

**Competencia [POR CONFIRMAR]:** existe un servicio que opera por llamada ("llámame y yo te solicito", compra y entrega). Averiguar cuánto cobra y si cobra por distancia. Si cobra S/5 o más, S/3 fijo es una ventaja visible. Diferenciales de Tindivo: precio fijo conocido antes de pedir, pedido sin llamar y seguimiento en el mapa.

## 2. Claves de configuración sugeridas

| Clave | Valor inicial | Notas |
|---|---|---|
| `recojo.precio_base` | 3.00 | |
| `recojo.disponible` | true | Interruptor global |
| `recojo.aviso_no_disponible` | texto | Se muestra al pausar |
| `recojo.espera.tolerancia_min` | 10 | [POR CONFIRMAR] |
| `recojo.espera.recargo` | 1.00 | [POR CONFIRMAR] |
| `recojo.espera.cancelar_desde_min` | 20 | [POR CONFIRMAR] |
| `recojo.promo_primer_recojo.activa` | false | Se activa cuando el flujo esté estable |
| `recojo.promo_primer_recojo.precio` | 1.50 | |
| `recojo.promo_primer_recojo.tope_usuarios` | 30 | |
| `recojo.promo_primer_recojo.dias` | lun–jue | |
| `recojo.max_activos_por_telefono` | 2 | Anti-abuso |

## 3. Promociones

### 3.1 Afiche de restaurantes (sistema de partners, fuera de alcance de esta iniciativa)

- Oferta: **primer pedido gratis al registrarse.**
- **Jesús absorbe solo lo que paga el usuario (S/2–2.50).** El fee de S/1.50 del restaurante no se toca.
- Costo por pedido gratis: S/2–2.50. Con un tope de 30 pedidos gratis, el costo máximo es **S/60–75**.
- **[POR CONFIRMAR]** el tope de pedidos gratis. Decidirlo antes de imprimir el afiche.

### 3.2 Promo de primer Recojo (activar después)

- **Precio S/1.50** en el primer recojo.
- **Una sola vez por número de teléfono**, para los **primeros 30 usuarios**.
- **Solo de lunes a jueves** (llena el valle, no compite con el sábado).
- Costo máximo: 30 × S/1.50 = **S/45**.
- **Se activa solo cuando el flujo esté estable.** Una promo sobre un flujo a medio hacer quema la promo y la primera impresión.
- **No apilar** con la promo del afiche de restaurantes en el mismo material.
- Si se agotan los 30: revisar resultados antes de renovar.
- Métrica clave: cuántos **repiten un segundo recojo pagando S/3**, no cuántos usan el primero barato.

### 3.3 Cuidado operativo

No llamar al motorizado adicional solo para atender promos. La promo tiene sentido cuando ya hay una moto disponible y sin pedidos.

## 4. Economía (para decidir cuándo llamar al motorizado adicional)

Datos: el motorizado adicional cuesta **S/30 por noche**. Con una tarifa base de S/3 por viaje (S/3.50–4 en pedidos de partners), el punto de equilibrio del costo del motorizado adicional es de **~10 viajes por noche** (viajes de Recojo y de partners, contados juntos).

| Viajes en el día | Ingreso aprox. a S/3 | Menos motorizado adicional (S/30) |
|---|---|---|
| 4 | S/12 | −S/18 |
| 10 | S/30 | S/0 |
| 20 | S/60 | S/30 |

(Sin incluir gasolina ni el mix real de pedidos de partners, que dejan más por viaje. Es una referencia, no una proyección.)

**Regla operativa:** llamar al motorizado adicional cuando la expectativa del día sea de ~10 viajes o más, o negociar una parte fija menor más pago por viaje en días flojos.

## 5. Eventos de tracking

| Evento | Parámetros |
|---|---|
| `catalogo_visita` | `src` |
| `mapa_abierto` | `src` |
| `busqueda` | texto |
| `click_llamar` | `negocio_id`, `src` |
| `click_pedir_recojo` | `negocio_id`, `src` |
| `popup_recojo_mostrado` / `popup_recojo_clic` | `negocio_id` |
| `recojo_solicitado` | `tipo`, `negocio_id`, `src`, `promo` |
| `recojo_completado` | `tipo`, `espera_min` |
| `recojo_cancelado` | `motivo`, `estado_al_cancelar` |
| `qr_escaneado` | `src` |

## 6. Panel de métricas semanales (mínimo)

1. **Recojos completados por semana**, separados en entre semana / fin de semana y por `tipo`.
2. **Minutos promedio de espera del motorizado** (y % de recojos con recargo).
3. **Clics en "Llamar" vs clics en "Pedir recojo"**, por negocio y por punto de entrada.
4. **Recojos por `src`** (afiche, qr, whatsapp, popup, redes, home).
5. **Recurrencia:** clientes con 2 o más recojos, y cuántos repiten a S/3 tras la promo.
6. **Recojos por negocio:** para saber cuáles vale la pena seguir visitando.
7. **Cancelaciones y motivos.**

## 7. Prueba de 2 semanas y criterios de decisión [PROPUESTA]

- **Duración:** 2 semanas desde que el flujo esté operativo y con ~10 negocios cargados.
- **Línea base:** entre semana, 10–12 viajes al día (con días de 4).
- **Meta:** ~40 recojos por semana entre semana.

| Resultado | Decisión |
|---|---|
| ≥ 40/semana, espera ≤ 8–10 min | Mantener S/3, probar S/3.50, sumar más negocios |
| 15–40/semana | Reforzar canales (negocios, kit, afiche) antes de sumar funciones |
| < 15/semana tras 2 semanas | Revisar el canal y el supuesto de demanda; no invertir más en producto |
| Muchos "Llamar", pocos "Pedir recojo" | Ajustar el pop-up post-llamada y la propuesta de valor; el catálogo solo no genera ingreso |
| Espera promedio > 10 min | Endurecer la regla de espera y la hora de listo; sin esto, el margen se pierde |
