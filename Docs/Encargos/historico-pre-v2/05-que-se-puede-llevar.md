# 05 · Qué se puede llevar

> ⚠️ **Actualización** (`07-integracion-recojo.md` G, H, K): el **alcohol se queda dentro de «Bebidas»** (Jesús, tras conocer los riesgos; sin categoría aparte ni casilla de edad, como ya dice §4). Los **documentos de identidad** y originales de valor **no se llevan**. La **categoría del artículo** solo se pide en «persona a persona».
>
> v0.3 · 2026-09-19 · **Catálogo de categorías permitidas**, no lista negra. Lo que no está en una categoría, no se pide.
> Los textos legales son un **borrador de producto**, aceptado como tal por Jesús; se recomienda revisión legal antes de publicar.

---

## 1. Qué es Encargos, dicho para el cliente

> **Encargos es recojo y entrega.** Un motorizado de Tindivo va a un lugar, **recoge algo que ya está listo**, y te lo lleva a donde tú digas.
>
> **No hacemos compras.** El motorizado no compra nada, no paga nada por ti y no cobra el artículo.

Por qué va **primero y bien explicado**: hacer compras toma mucho más tiempo, obliga al motorizado a adelantar dinero y cambia el riesgo del efectivo. Puede venir más adelante, diseñado aparte; **no entra en v1** (`06-backlog.md`).

**Sí:** «recoge un documento en casa de un amigo y llévalo a mi casa» · «lleva estas llaves a mi hermana» · «recoge mi almuerzo, ya pagado, en casa de mi mamá» · «recoge la medicina que me dejó la botica».
**No:** «cómprame una gaseosa» · «paga mi recibo de luz» · «haz cola en el banco».

Bajo el título de la pantalla, siempre visible: *«Solo recojo y entrega. No hacemos compras.»*

---

## 2. El modelo: categorías permitidas

Cada categoría es un **registro de configuración** en `app_settings.errands.categories`, editable desde el admin sin desplegar código. El cliente **elige una** y la app le muestra **las reglas de esa categoría**. Activar o pausar una categoría mañana es un interruptor, no un cambio de código.

```jsonc
{ "id": "medicines", "label": "Medicinas", "enabled": true,
  "maxDeclaredValue": 200,          // tope de valor para esa categoría
  "handling": "isolated",           // pista para el motorizado: cómo llevarlo (compartimento aislado)
  "sealedRequired": true,           // exige envase o bolsa cerrados
  "note": "…" }                     // texto que ve el cliente al elegirla
```

### Categorías v1

| Categoría | Estado | Qué entra | Reglas |
|---|---|---|---|
| **Documentos y papeles** | ✅ | Carpetas, sobres, trámites, contratos | — |
| **Comida lista** | ✅ | Almuerzos, postres, comida preparada | Envase cerrado, sin líquidos sueltos. Tindivo no responde por derrames ni temperatura |
| **Bebidas** | ✅ | Botellas, botellines y latas cerradas (gaseosas, jugos, agua y demás) | Envase cerrado; compartimento aislado; **no cajas** (5 kg y mochila). El alcohol **no se separa ni se anuncia** (§4) |
| **Medicinas** | ✅ con reglas (§3) | Lo que ya compró o le entregó la botica | Bolsa sellada por la botica; ver reglas propias |
| **Ropa y accesorios** | ✅ | Prendas, gorras, carteras pequeñas | — |
| **Llaves y objetos pequeños** | ✅ | Llaves, cargadores, audífonos, controles | — |
| **Paquete cerrado** | ✅ | Cualquier caja o bolsa cerrada que quepa | El motorizado puede pedir ver qué es |

- **Joyas y dinero: no se mencionan.** No hay categoría ni texto que los invite (decisión de Jesús: la gente no confía valores así a un motorizado, y anunciarlo solo atrae reclamos). Lo que se cuele dentro de un «Paquete cerrado» queda igual bajo el **tope de S/ 200** y los términos.
- **Sin categoría «Otro».** Es por donde se cuelan los artículos que no queremos. Si aparece un pedido razonable que no cabe en ninguna, la respuesta es *añadir* una categoría, no un comodín.

---

## 3. Medicinas: cómo hacerlo bien

Jesús quiere la categoría **para que se vea** que el servicio puede llevar una medicina, y pidió que la plantee mejor. Mi propuesta es no esconderla dentro de «Paquete cerrado» —callar el caso más probable sería peor— pero **acotarla mucho**, porque en el cliente cualquiera diría «medicina» y la regla tiene que decir cuál.

**Lo que entra:** medicinas **ya compradas o entregadas**, en **bolsa o envase sellado** por la botica o por la persona que las entrega. Es decir, lo mismo que un mensajero llevaría de una mano a otra.

**Lo que se acota (y por qué):**

| Regla | Por qué |
|---|---|
| **Van en el compartimento aislado de la mochila** | Jesús: la mochila tiene un compartimento aparte para bebidas y cosas que no deben ir con la comida, y los trayectos son cortos. Las medicinas **se aíslan ahí**, separadas de la comida |
| **Sin refrigeración especial** (insulina, vacunas y lo que exija frío controlado) | El compartimento **aísla, no refrigera**. Un motorizado en moto no puede garantizar una cadena de frío, y para esos productos la normativa de distribución exige control de temperatura |
| **Sin controladas** (psicotrópicos, estupefacientes, las que se dispensan con receta retenida). **Aprobado por Jesús** | Riesgo legal y de entregar a la persona equivocada |
| **Entrega a la persona indicada** | El motorizado confirma **el nombre** de quien recibe antes de entregar |
| **Tindivo no verifica ni el contenido ni la receta** | Es un servicio de mensajería, no un establecimiento farmacéutico; no almacena, no dispensa, no da indicaciones |

**Texto que ve el cliente al elegirla:**
> «Solo recogemos y llevamos lo que ya te dio la botica, en su bolsa sellada, en un compartimento aparte de la comida. No compramos medicinas, no las guardamos y no llevamos las que necesiten frío ni las de receta controlada.»

**Lo que no pude comprobar:** busqué la normativa peruana (DIGEMID) y lo que encontré regula a los **establecimientos farmacéuticos y operadores logísticos** que distribuyen medicamentos, no a un mensajero que lleva de una persona a otra algo ya dispensado. **No encontré una norma concreta para ese caso y no lo puedo afirmar.** Con las reglas de arriba el riesgo baja, pero **recomiendo confirmarlo con alguien que conozca la normativa** antes de abrir esta categoría a volumen. Como es un interruptor, se puede apagar sin desplegar nada.

---

## 4. Bebidas (incluidas las alcohólicas), sin destacarlas

**Decisión de Jesús (2026-09-19):** hay **una sola categoría, «Bebidas»**, sin separar ni anunciar el alcohol, y **sin casilla de mayor de edad** en la pantalla. Lo que se lleva son botellas o envases cerrados, **no cajas**: los límites de **5 kg** y de **caber en la mochila** ya lo acotan (unas tres o cuatro botellas de cerveza), así que no hace falta un tope de unidades.

**Reglas que sí quedan (no añaden ninguna pantalla):**

| Regla | Dónde vive |
|---|---|
| **Envase cerrado** | Reglas de la categoría |
| **Compartimento aislado** | Pista al motorizado en la tarjeta (`handling: "isolated"`) |
| **Protección de las botellas** | Jesús resuelve cómo evitar que revienten con los baches (acolchado). Es operación, no software, y **conviene tenerla lista antes de la primera noche** |
| **El motorizado puede negarse a entregar** si es evidente que quien recibe es un menor | Política interna y términos (§7); no es un campo de la app |
| **El cliente responde por lo que pide** | Cláusula de los términos, que ya lleva casilla de aceptación (§7) |

**Por qué recomiendo no borrar del todo esa protección, aunque no salga en pantalla.** Jesús dijo que la edad «no nos tiene que concernir», y me pidió ayuda. Busqué la ley: la **Ley N.° 28681** prohíbe **vender, distribuir, expender y suministrar** bebidas alcohólicas, **a título oneroso o gratuito**, a menores de 18 años, y su reglamento sanciona también a los **mayores que faciliten el consumo** a menores ([texto](https://vlex.com.pe/vid/ley-n-28681-regula-816951477)). Encargos **no vende** la bebida, pero «distribuir» y «suministrar» pueden alcanzar a quien la entrega. Además, un medio recoge que en mayo de 2026 se **aprobó crear el delito de expendio a menores, con hasta 4 años de cárcel** ([Infobae](https://www.infobae.com/peru/2026/05/22/aprueban-crear-el-delito-de-expendio-de-bebidas-alcoholicas-a-menores-de-edad-hasta-4-anos-de-carcel/)); **no comprobé si ya está vigente**. No soy abogado y no sé cómo lo aplicaría un juez a un mensajero, pero la exposición recaería sobre **el motorizado, que es quien entrega en la puerta**.

Por eso la solución que propongo **cuesta cero de experiencia de usuario**: el cliente ya acepta unos términos, y esos términos dicen que él responde por que lo entregado sea apropiado para quien lo recibe; y el motorizado tiene **permiso explícito de negarse**. Es la misma cobertura que el resto de la plataforma (Tindivo no responde por lo mal declarado), sin una casilla más.

La sanción concreta la fijan las **ordenanzas municipales**. Conviene preguntar en la Municipalidad de San Jacinto si tiene alguna regla local sobre entrega de alcohol.

Que se rompa una botella es el reclamo más probable de toda la feature, y entra en la responsabilidad de Tindivo (tope de S/ 200, §7).

Que se rompa una botella es el reclamo más probable de toda la feature, y entra en la responsabilidad de Tindivo (tope de S/ 200, §7). Si aparecen muchos, se apaga con el interruptor.

---

## 5. Lo que queda fuera (peligroso o ilegal)

- **Tabaco y vapeadores** (decisión de Jesús).
- **Armas, municiones, pólvora, fuegos artificiales, explosivos, inflamables, tóxicos, radiactivos.**
- **Sustancias ilegales**, robos y todo lo de venta restringida.
- **Personas y animales.**
- **Dinero en efectivo** (decidido).
- **Todo lo que no quepa en la mochila o pase de 5 kg.**

**El motorizado puede negarse a recoger** si algo no coincide con lo declarado o le parece riesgoso. Reporta (no decide solo) y, si ya llegó a A, el cliente **paga la visita** [D-10].

---

## 6. Límites físicos y de valor

| Límite | Valor | Estado |
|---|---|---|
| **Tamaño** | **45 × 45 × 45 cm** (la mochila). Imagen de referencia en la app con esas cifras | Decidido |
| **Peso** | **5 kg** máximo | Decidido |
| **Valor declarado** | **S/ 200** máximo | Decidido |
| **Empaque** | Caja, bolsa o envase **cerrado** | Propuesta |

El **valor declarado no se cobra ni se reembolsa**: sirve para limitar lo que Tindivo transporta y hasta dónde responde si algo se pierde.

---

## 7. Borrador de términos

> ⚠️ Borrador de producto. Se recomienda revisión legal antes de publicar.

1. Tindivo es un **servicio de mensajería**: recoge y entrega. **No compra, no paga por el cliente y no cobra el valor del artículo.**
2. Tindivo transporta únicamente artículos de las categorías permitidas, **declarados con veracidad** por el cliente.
3. Tindivo **no responde** por artículos mal declarados, mal empacados, frágiles o fuera de las categorías.
4. Si un artículo permitido se **pierde o se daña** por causa del servicio, la responsabilidad de Tindivo se limita al **valor declarado, con un tope de S/ 200**.
5. **Medicinas:** Tindivo **no es un establecimiento farmacéutico**. No verifica el contenido ni la receta, no almacena, no dispensa ni da indicaciones. No transporta productos que requieran frío ni medicamentos de receta controlada. El cliente es responsable de lo que declara.
5 bis. **El cliente es responsable de que lo entregado sea apropiado para quien lo recibe** (por ejemplo, que sea mayor de edad en el caso de bebidas alcohólicas). El motorizado puede **negarse a entregar** si es evidente que no lo es.
6. El motorizado **no entrega el artículo sin cobrar** el servicio (`02` §3) y puede negarse a recoger o a entregar si algo no coincide con lo declarado.
7. Si el motorizado llega a A y el cliente no entrega el artículo, o entrega uno que no corresponde, **se cobra la visita**.
8. **Tiempos de espera:** el motorizado espera hasta **5 minutos** en cada punto, con llamada. Pasado ese plazo, reporta y decide Tindivo.

El cliente los **acepta con una casilla** antes de pedir, con lo esencial **delante de sus ojos** (mismo criterio que la política de recojo, `DECISIONS §8`).
