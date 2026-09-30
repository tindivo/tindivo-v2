# Nuevo modelo L–V · Plan consolidado (Claude + Codex)

> **v1 · 2026-09-30.** Sale de tres rondas de debate entre Claude y Codex
> (`debate/01` a `06`), sobre `propuesta-claude.md`, con datos de solo lectura
> de **`tindivo-prod`** y dos aportes de Jesús: el pueblo tiene ~5000
> habitantes, y los restaurantes no aliados rechazan S/ 1.50, así que prefiere
> B2C. **Pendiente de aprobación de Jesús.** Los cuatro puntos del §6 son suyos.

## 1. En una frase

**Lanzar solo Tindivo Entregas (lo que ya está a medio construir), a S/ 3 que
paga el cliente, de lunes a viernes, rellenando los huecos del motorizado que
ya está pagado.** «Comprar» (encargos), la comunidad de WhatsApp, la
gamificación, la autocorrección, los programados y la agrupación por zona
**quedan fuera** hasta que Entregas demuestre que funciona sola.

## 2. Qué dicen los datos (y qué tumbó de la propuesta)

Consultas de solo lectura a `tindivo-prod`, pedidos entregados, últimas 6 a 8
semanas.

| Dato | Valor | Qué cambia |
|---|---|---|
| Asignado → entregado (mediana L–V) | **11.5 min** (p90 25) | Los «20 min por pedido» de la propuesta estaban inflados |
| Recogido → entregado (mediana) | **5.2 min** | Pueblo chico: el tiempo se va en esperar, no en el camino |
| **Minutos libres por noche L–V con un solo motorizado** (22 noches, +3 min de vuelta por salida) | **mediana 158 de 300** | Hay capacidad ociosa real |
| Bloques libres de 15 min por noche | **mediana 7, p25 6**; ~2 caen entre 7 y 10 pm | Caben ~6 entregas, sobre todo **antes de las 7 pm y después de las 10 pm** |
| Pedidos por hora L–V | 18 h: 0.9 · **19–20 h: 3.3** · 21 h: 2.7 · 22 h: 1.5 | El pico es de 7 a 10 pm |
| Origen de los pedidos de comida | **89 % los carga el restaurante** (`business_manual`) | El hábito del pueblo es **llamar al negocio**, no entrar a la web |
| Clientes distintos en 8 semanas | 442, de los que 168 repiten | La base de clientes ya existe: es el primer público |
| `courier_orders` en producción | 0 filas | Entregas no ha corrido nunca |

**Lo que se descartó de la propuesta, y por qué:**

- **S/ 2 al cliente y S/ 0 al negocio:** abre un arbitraje. Un partner atiende
  por teléfono, pide un «envío» y deja de pagar su S/ 1.50. Tindivo competiría
  contra sí mismo con el modelo de Zorritos.
- **Fondo rotativo de S/ 100 para encargos:** Jesús financia compras de
  desconocidos, y un rechazo de S/ 30 se come el ingreso de 9 encargos. Además,
  choca con «Tindivo no retiene fondos».
- **Encargos en la V1:** es el servicio que menos rinde por minuto
  (S/ 0.08–0.12, frente a S/ 0.17 de la comida) y el que más coordinación le
  exige a Jesús.
- **«Tindivo Recojos»** como nombre: choca con el recojo en tienda, que ya está
  en producción. Se queda **«Tindivo Entregas»**.

## 3. El modelo

- **Qué:** recoger algo **ya coordinado, pagado y listo** y llevarlo dentro de
  San Jacinto. Puede ser de persona a persona o de negocio a persona.
- **Precio:** **S/ 3**, que paga el cliente. Sin promo al lanzar: en un pueblo
  es fácil bajar un precio y casi imposible subirlo.
- **Protección de partners:** **la comida preparada no va por Entregas** en el
  piloto. Un restaurante que quiere entregas es un partner por conseguir.
- **El negocio:** **no paga nada ni es cliente**. Su incentivo es cerrar una
  venta sin buscar motorizado ni pagar transporte. Lo que sí se le exige es que
  **la bolsa esté lista y pagada**: si Jesús tiene que perseguirla, esa tienda
  sale del piloto.
- **Canal:**
  1. **El enlace del negocio**, con él ya puesto como punto de recojo, para que
     lo comparta por WhatsApp o en sus estados.
  2. **El QR de mostrador**, como complemento: el cliente que necesita delivery
     casi nunca está en el mostrador.
  3. **Los clientes actuales**, contactados por canales consentidos.
  4. **Persona a persona**, que no depende de ningún negocio.
- **Capacidad:** **1 entrega activa por motorizado** para empezar, con la
  comida siempre primero. Se amplía solo si los tiempos reales lo permiten.
  Cualquier franja que demore comida se suspende.
- **Motorizado:** **turno fijo durante el piloto**. Un bono por paquete
  empujaría a aceptar de más y a relegar la comida.

## 4. Lo que falta construir (camino crítico)

Hoy la rama `tindivo-courier` tiene el backend (`0232`–`0234`), los contratos,
la API del cliente y el flujo de pedir y seguir en `apps/customer`.
**Hoy nadie puede atender una entrega:**

| # | Pieza | Estado | Por qué es imprescindible |
|---|---|---|---|
| 1 | **App del motorizado:** ver, aceptar, soltar y avanzar entregas en su panel (en azul, la comida primero) | **No existe** | Sin esto no hay piloto |
| 2 | **Cobro y rendición:** el motorizado cobra S/ 3 (efectivo exacto o su Yape) y rinde a diario (`driver_payment_qrs`, `courier_remittances`) | **No existe** (la `0232` lo deja para después) | Sin cuadre, el dinero no se controla |
| 3 | **Tope de capacidad:** 1 entrega activa por motorizado; «disponible» debe mirar su carga | La comprobación actual **no mira la carga** | Protege la comida |
| 4 | **Cancelación tras el recojo y retorno a origen:** quién custodia y quién paga el viaje de vuelta | Sin definir | Caso real el primer día |
| 5 | **Enlace o QR por negocio** que abre Entregas con el origen precargado | Por comprobar | Es el canal |
| 6 | **`0234` en producción** (`supabase db push`) | Pendiente | El seguimiento la usa |
| 7 | Terminar la lista de UX de la rama (`bedff6a`) | En curso | Solo lo que bloquee pedir sin ayuda |

Lo que **no** se construye: un panel de Entregas en `apps/negocios`, quitar el
límite de «1 activo por teléfono», el flujo de compras, el directorio extenso,
la gamificación ni el nuevo inicio de tres botones. El inicio lleva dos
entradas: **Comida** y **Tindivo Entregas**.

## 5. Plan de acción (cada paso con su criterio)

| Paso | Qué | Criterio para avanzar |
|---|---|---|
| **1 · Cerrar la operación** (semana 1) | Piezas 1–6 del §4. Una prueba completa de punta a punta | Varias entregas de prueba sin que Jesús improvise nada, y el dinero **cuadra al centavo** |
| **2 · Probar el acceso con 5 personas** | Enlace con origen precargado, persona a persona y S/ 3 visible antes de pedir | **4 de 5** completan sin ayuda. Si no, se corrige antes de promocionar |
| **3 · Captar con alcance acotado** | **3 tiendas** (botica, bodega y una vendedora de Facebook) + clientes actuales. Enlaces antes que afiche | Se mide exposición (quién vio precio y horario) y solicitudes, sin que Jesús gestione caso por caso |
| **4 · Operar 10 días hábiles** | L–V de 6 a 11 pm, 1 entrega activa por motorizado | Cero demoras de comida atribuibles a Entregas. Si una franja las causa, se suspende esa franja |
| **5 · Clasificar el resultado** | Ver el §7 | Continuar, ajustar **una sola** variable o detener |
| **6 · Escalar lo demostrado** | Más tiendas o más difusión, antes que más funciones | **Dos semanas seguidas** con contribución positiva y operación autónoma **antes de pasar el flujo a la app móvil** |

**Límite para el fundador:** como máximo **15 min diarios** de Jesús en
coordinación y cierre. Si Entregas depende de que él reparta o conteste
chats, no es sostenible.

## 6. Desacuerdos que decide Jesús

1. **La capacidad garantizada.** Claude: los datos permiten apuntar a ~6 por
   noche. Codex: los huecos históricos no son ventas garantizadas, así que no
   se promete cifra y los cupos se abren según la carga real. *Recomendación
   común:* no anunciar cupos y medir.
2. **Tiendas como canal aunque no paguen.** Codex: que un restaurante rechace
   S/ 1.50 no prueba que una botica rechace originar entregas gratis, así que
   hay que mantener abierta esa vía. Claude: de acuerdo, **siempre que pague el
   cliente**. Queda por decidir si una tienda puede crear la entrega en nombre
   de su cliente o solo compartir el enlace.
3. **«Listo y pagado» como condición dura.** Codex lo exige: sin eso, Entregas
   se convierte en compras encubiertas con esperas que nadie paga. Claude está
   de acuerdo. Falta que Jesús lo confirme como regla hacia las tiendas.
4. **Comida preparada.** Fuera durante el piloto (en esto coinciden los dos).
   Codex pide no convertirlo en dogma permanente. Se revisa tras el piloto.

## 7. Cómo se decide a las 2 semanas

Estos umbrales son iniciales, de prueba.

- **B2C viable → continuar:** al menos **20 entregas pagadas a S/ 3**, de **10
  solicitantes distintos**; **≥ 80 %** creadas sin intervención de Jesús ni del
  negocio; **≥ 90 %** de las solicitudes elegibles completadas; contribución
  positiva, dinero cuadrado y **≤ 15 min diarios** de Jesús. La recompra se
  registra, pero todavía no se exige.
- **Canal asistido por tiendas:** hay demanda pagada, pero la mayoría necesita
  que la tienda gestione la solicitud. Entonces se decide si se sostiene
  gratis como adquisición. **Si la gente llama a Jesús, eso es dependencia del
  fundador, no un canal.**
- **Sin tracción:** menos de 5 pagan entre al menos 50 personas que vieron
  precio, zona y horario, con pocas trabas técnicas. Esto cuestiona **la
  oferta**, no la demanda de todo el pueblo.
- **Inconcluso:** si hubo poca exposición, caídas o abandono del formulario.
  Se repite la prueba corrigiendo eso; **no justifica otra app**.

## 8. Qué no se toca

- El precio y el flujo de los restaurantes partners.
- El fin de semana: sábado y domingo, solo comida. Ojo: esto **cambia lo ya
  decidido** («todos los días, 6–11 pm») y hay que reflejarlo en
  `Docs/Encargos/04`.
- La mensualidad a partners: depende del valor demostrado, no de que salga la
  app móvil.

## 9. Pendientes fuera del software (Jesús)

- Confirmar el costo real de personal (¿S/ 210 o S/ 270 a la semana con 2
  motorizados en fin de semana?) y la comisión real por pedido (DECISIONS dice
  S/ 1; la propuesta, S/ 1.50).
- Cargar el QR o Yape de cada motorizado y definir quién recibe la rendición.
- Elegir las 3 tiendas del piloto y conseguir su compromiso de «listo y
  pagado».
- Condiciones de Yape para una cuenta personal que recibe muchos cobros
  pequeños.
