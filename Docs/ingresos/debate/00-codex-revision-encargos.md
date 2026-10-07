# 00 · Codex · Revisión de Encargos v2 (antecedente)

> 2026-10-07, antes del debate de ingresos. Codex revisó `Docs/Encargos/compras/` (v2) y contrastó `04-plan-tecnico.md` con el código, en solo lectura. Claude comprobó las afirmaciones que cambian el plan (`customer_user_id` obligatorio, `ready_at` forzado a `now()` en `0240`, el bucket público de Store).

**No aprobaría todavía la fase 1.** Aprobaría una fase 0 que mida costos y pruebe cancelaciones, pérdidas y rendición. S/ 2.50 es contribución antes de gastos y pérdidas; el control propuesto permite fingir un impago.

No modifiqué archivos. La verificación del código es estática. No pude consultar el estado vivo de `tindivo-prod`: SQL quedó bloqueado por la política de aprobación y el listado remoto falló por falta de credenciales.

**Trabajo 1 · Debate A–H**

Mantengo lo decidido en `06` §2. Solo cuestiono su aplicación cuando aparece una contradicción explícita, indicada abajo.

| Punto | Veredicto | Argumento más fuerte contra la postura actual | Qué haría |
|---|---|---|---|
| **A · Rentabilidad** | **Matizar.** | Moto pagada no significa trayecto gratis. Tindivo cubre impagos, combustible si corresponde, tiempo de Jesús y comida que deje de atenderse. Con 5–7 encargos, una pérdida pequeña consume la semana. | Mantener S/ 3.50 durante el ensayo y medir contribución neta por encargo **y por minuto de moto**. No introducir porcentajes todavía. |
| **B · Plata propia y rotación** | **En desacuerdo con que desaliente el abuso.** | Si Tindivo devuelve la compra impaga, el motorizado no soporta finalmente ese riesgo. Uno de una semana puede cobrar al cliente y declarar pérdida antes de irse. Además, recuperar en 15 minutos contradice la mediana objetivo de 35 minutos. | Mantener plata propia; comprobar saldo disponible y sencillo al iniciar turno. Precisar cuándo se reembolsa una pérdida y cerrar deuda antes del último turno. |
| **C · Sacar a Jesús del medio** | **Matizar.** | Registrar en un minuto elimina digitación, no llamadas, aclaraciones, cambios, reclamos ni rescates. El cliente puede seguir escribiéndole aunque tenga enlace. | Enviar siempre el enlace con una acción concreta pendiente. Medir intervenciones posteriores al registro; probar primero respuestas rápidas y ficha breve, sin bot. |
| **D · Control sin boleta** | **En desacuerdo.** | Una captura puede editarse o reutilizarse. Incluso un pago real puede hacerse a un cómplice y devolverse después; tampoco prueba qué se compró. | Registrar destinatario e identificador del pago, contrastarlos con la tienda y hacer comprobaciones aleatorias. Reembolso revisado por Jesús y devolución física de la bolsa. |
| **E · Promesa de tiempo** | **Matizar.** | El motorizado controla tanto la promesa como el toque que aparenta cumplirla. Prometer siempre 30 minutos mejora su indicador mientras pierde clientes. `03` incluso recomienda hacerlo. | Medir espera desde solicitud, salida, compra y entrega; conservar promesa original y prórroga por separado. Auditar algunas salidas y registrar demanda perdida. |
| **F · Llamar al cliente** | **En desacuerdo con depender solo del aviso.** | Cinco minutos sin leer un push no prueban ausencia. Ocultar el identificador de quien llama tampoco oculta al motorizado el número al que llama. | Aceptar explícitamente llamadas desde el celular personal durante el servicio y corregir «tu número no se da». Si se exige ocultarlo, hace falta otro canal real de contacto. |
| **G · Fin de semana** | **En desacuerdo con que la ETA regule sola.** | Una promesa aceptada reserva trabajo futuro; no crea capacidad. Dos motos con el doble de comida pueden estar igual de saturadas. | Mantener apertura todos los días, pero habilitar encargos según carga real. Probar fin de semana como segmento separado y rechazar cuando no exista una ventana viable. |
| **H · Defaults** | **Matizar; cerrar uno por uno.** | Mezcla decisiones de riesgo, margen y alcance sin respaldo operativo. | Mantener inicialmente exclusiones de alcohol/cigarros y recetas; mantener S/ 50 sin subirlo por historial; definir combustible; conservar derivación de aliados a su carta; resolver responsabilidad y reclamaciones desde fase 0. |

Para **H**, una foto de receta no basta para que Tindivo autorice una compra: la dispensación corresponde a la botica, que debe exigir receta cuando proceda. [Minsa](https://www.gob.pe/institucion/minsa/noticias/771619-farmacias-y-boticas-deben-exigir-presentacion-de-receta-antes-de-vender-medicamentos-que-requieren-prescripcion-medica). El Libro de Reclamaciones tampoco es un pendiente exclusivo de la app: Indecopi incluye establecimientos físicos y virtuales. [Indecopi](https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf).

**Contradicciones y reglas incompletas**

- **Confirmación del cliente:** [01:82](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:82) exige aceptar el tiempo antes de mover la moto; [01:92](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:92) y [04:103](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/04-plan-tecnico.md:103) hacen que «Ahora» arranque directamente. **Contradice `06` §2.4:** aclararía qué aceptación previa autoriza ese arranque.
- **Un activo, pero otro reservado:** [01:46](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:46) permite aceptar el siguiente con tiempo; [04:103](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/04-plan-tecnico.md:103) limita a uno activo. Falta definir si `offered`/`accepted` ocupan cupo y cuántas reservas caben.
- **Cancelación gratuita después de comprometer comida:** [01:119](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:119) termina la cancelación gratuita al cocinar; [04:78](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/04-plan-tecnico.md:78) cancela sin cobro mientras no exista `purchase_total`. Cocinar puede ocurrir antes de pagar. **Reabre explícitamente la aplicación de `06` §2.3:** la ausencia de compra registrada no significa ausencia de gasto comprometido.
- **Plata “no puesta” versus pérdidas y adelantos:** [02:9](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/02-dinero-y-control.md:9) contradice [02:70](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/02-dinero-y-control.md:70) y [02:83](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/02-dinero-y-control.md:83). No cambiaría el modelo; cambiaría esa afirmación y presupuestaría ambas salidas.
- **Horario incompatible con la promesa:** recepción hasta 10:30, oferta de 30 minutos, posible prórroga y compra posterior permiten terminar después de las 11. [01:40](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:40). El corte debe considerar cierre de tienda y capacidad de completar.
- **Precio sin autorización previa suficiente:** la ficha no pide presupuesto ni precio esperado, pero [01:172](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/01-servicio.md:172) pregunta solo si la diferencia supera S/ 5. ¿Diferencia contra qué? Mostrar el total **después de comprar** no es aprobarlo.
- **Reglas del nuevo motorizado incompletas:** `03` dice que lo ausente no es regla, pero omite el límite de dos tiendas, la exclusión de aliados y quién pierde por comprar algo incorrecto. [03:3](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/compras/03-reglas-del-motorizado.md:3).

**Fraude y plata que faltan**

1. **Impago fingido:** cobra en efectivo, marca «Llegué», espera cinco minutos y pide reembolso. La foto y los botones cumplen todas las condiciones de cobertura. También puede hacerlo con un cliente cómplice. Hace falta corroboración independiente y registro de cada reembolso, devolución y recuperación.
2. **Compra equivocada “por primera vez”:** cada motorizado nuevo tiene una primera pérdida cubierta. Con rotación semanal, esa tolerancia se renueva continuamente.
3. **Encargos por fuera:** registrado gana S/ 1; fuera del sistema puede quedarse con S/ 3.50. El bono incentiva registro por cobertura del impago, pero económicamente no elimina el desvío.
4. **Cliente oportunista:** puede cambiar de teléfono, pedir mediante terceros o aprovechar una ficha manual con número no verificado. Bloquear un celular no limita la exposición acumulada.
5. **Cancelación o error parcial:** no se define cuánto cobrar/rendir si el cliente paga solo lo correcto, qué pasa con el bono, ni quién conserva productos recuperados. `loss_amount` por sí solo no contabiliza un reembolso efectivamente pagado.
6. **Costos sin venta:** tienda cerrada, preguntas vencidas y cliente ausente consumen gasolina y tiempo aunque no produzcan fee. También faltan pérdidas por deterioro, daño, devolución y vuelto insuficiente.

**La economía**

El bono ya está descontado: **S/ 3.50 − S/ 1 = S/ 2.50**. No hay que restarlo dos veces. Tampoco llamar “limpio” al resultado.

Con **S/ 15 de pérdidas semanales**, antes de combustible y demás costos:

| Encargos completados | Contribución restante |
|---|---:|
| 5 | **−S/ 2.50** |
| 7 | **S/ 2.50** |
| 21 | **S/ 37.50** |

Una pérdida irrecuperable de **S/ 50 consume 20 encargos exitosos**. Si cada fallo pierde S/ 50, una tasa de fallos de aproximadamente **4.8 %** agota todo el margen, incluso antes de gastos. El presupuesto S/ 15 es una alarma, no un límite efectivo: un solo pedido puede excederlo.

**Lo que fase 0 debería medir**

Además de lo previsto en `05`:

- Todas las solicitudes, incluso rechazadas y abandonadas, con motivo.
- Hora de oferta, confirmación, salida, compromiso de cocina, pago, llegada y cobro. Hoy la hoja no permite calcular «salió antes de `start_by`».
- Minutos, kilómetros y combustible de encargos exitosos **y fallidos**; demoras añadidas a comida.
- Saldo disponible, necesidad de sencillo, tiempo hasta recuperar capital y restricciones reales de Yape.
- Intervenciones de Jesús después del registro, no solo minutos rellenando fichas.
- Pérdida bruta, reembolso pagado, recuperación y pérdida neta; rendimiento separado entre semana/fin de semana y por motorizado.

El ensayo de seis casos omite justamente impago, pago parcial, cancelación con cocina comprometida y cierre mezclando Comida/Entregas/Encargos.

**Trabajo 2 · Contra el código**

“VERIFICADO” significa respaldado por archivos; no ejecución contra una base.

| Afirmación | Resultado y evidencia |
|---|---|
| Existen `courier_orders`, `courier_status`, `at_pickup` y `picked_up` | **VERIFICADO.** Tabla en [0232:170](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:170); enum SQL en [0232:55](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:55), contrato en [enums.ts:257](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/enums.ts:257). |
| Existen `ready_in_min`/`ready_at` | **VERIFICADO**, [0232:198](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:198). **FALSO si se interpreta como funcionalidad reutilizable ya operativa:** la creación vigente ignora los minutos y guarda `0, now()`, [0240:139](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0240_entregas_abre_aunque_nadie_este_disponible.sql:139). Falta escribir/actualizar el plazo del restaurante. |
| Existe `driver_courier_step`, con bloqueo e idempotencia | **VERIFICADO**, [0235:204](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0235_el_motorizado_atiende_entregas_con_tres_botones.sql:204), bloqueo e idempotencia desde línea 227. Hay tests en [courier-driver-step.integration.test.ts:113](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/__tests__/courier-driver-step.integration.test.ts:113); no ejecuté la suite. |
| `directory_businesses` tiene teléfono y horarios | **VERIFICADO**, `phone`, `opens_at`, `closes_at` en [0232:116](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:116). Son horarios referenciales, no un calendario de apertura. |
| `db_public_read` permite leer `phone` como `anon` | **VERIFICADO en la definición RLS:** admite filas `visible_on_map` sin ocultar columnas, [0232:163](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:163). **NO PUDE VERIFICAR** el `SELECT` efectivo en producción, que también depende de grants. |
| `anon` tiene INSERT/UPDATE de columna | **NO PUDE VERIFICAR.** `0232` no declara esos grants; sus policies de escritura son para admin autenticado, [0232:155](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:155). Tener un grant tampoco implica poder escribir atravesando RLS. |
| Rendición adaptable sin romper Entregas | **VERIFICADO como posibilidad; FALSO que baste cambiar un monto.** Ambos eventos registran `fee_amount`, [0237:89](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0237_la_deuda_de_entregas_se_rinde_y_jesus_la_confirma.sql:89) y línea 139; la deuda visible también, [courier-driver.ts:104](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/mappers/courier-driver.ts:104). Todos deben usar el derivado por `kind`, preservando Entregas cobradas incluso si luego se cancelaron. |
| Primer número libre: 0246 | **VERIFICADO en archivos locales:** el máximo es [0245:1](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0245_los_vendidos_de_store_traen_su_condicion.sql:1). **NO PUDE VERIFICAR** historial aplicado ni que Store siga pendiente en remoto. |
| Los cinco iconos existen | **VERIFICADO en el inventario:** `photo_camera` 74, `receipt_long` 80, `shopping_bag` 92, `storefront` 100, `timer` 103. [icons.txt:74](/Users/jesuscastillo/Developer/tindivo-v2/apps/motorizados/public/fonts/icons.txt:74). |
| `offered` encaja sin cambiar consumidores actuales | **FALSO.** Faltan enum, transiciones y proyección de tracking, [courier-status.ts:15](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/courier-status.ts:15). La aceptación actual solo toma `requested`, [0232:604](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:604); además, el wrapper devuelve éxito si ya pertenece al motorizado, [0235:234](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0235_el_motorizado_atiende_entregas_con_tres_botones.sql:234). No sirve para confirmar una oferta. |
| Existe la plantilla y dice «el encargo» | **VERIFICADO**, [courier-whatsapp-templates.ts:58](/Users/jesuscastillo/Developer/tindivo-v2/apps/motorizados/lib/courier-whatsapp-templates.ts:58), también líneas 64, 70 y 76. |

Otros tres problemas técnicos:

- **Rutas heredadas que eluden las reglas nuevas:** `/step` permite recoger y entregar sin foto ni validación de compra; la cancelación del cliente llama la RPC genérica. Deben distinguir `kind` en servidor. [step/route.ts:58](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/driver/courier-orders/[id]/step/route.ts:58), [cancel/route.ts:47](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/courier-orders/[id]/cancel/route.ts:47).
- **WhatsApp sin cuenta no está resuelto:** `customer_user_id` es obligatorio y la lectura del cliente exige `auth.uid()`. Agregar `tracking_token` no resuelve creación, lecturas, fotos privadas ni Realtime. [0232:175](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:175), [0232:267](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:267). El token debe quedar fuera de lecturas del motorizado y habilitar respuestas acotadas.
- **Dos referencias equivocadas:** Store usa bucket **público**, no un patrón privado, [0242:323](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0242_tindivo_store_vende_lo_que_hay_en_san_jacinto.sql:323). Y revocar columnas no neutraliza un grant de tabla: hay que retirar el permiso amplio y conceder explícitamente la lectura permitida. [PostgreSQL 17](https://www.postgresql.org/docs/17/sql-grant.html).

**Lo que yo cambiaría antes de aprobar**

1. Cerrar cancelación y responsabilidad desde que se compromete cocina, incluyendo compra parcial.
2. Exigir presupuesto autorizado antes de comprar; definir confirmación para «Ahora».
3. Diseñar reembolso verificable, devolución de productos y registro de pérdidas pagadas/recuperadas.
4. Medir margen neto y costo de desplazar comida; reemplazar “S/ 2.50 limpios”.
5. Definir reservas, cupos y horario según capacidad real, especialmente fines de semana.
6. Resolver cliente sin cuenta, llamadas y permisos de teléfonos, tokens y fotos.
7. Adaptar rendición y bloquear rutas heredadas que eviten foto, confirmación o restricciones de compra.
8. Ampliar fase 0 y el ensayo con impago, cocina comprometida, pago parcial y cierre combinado.