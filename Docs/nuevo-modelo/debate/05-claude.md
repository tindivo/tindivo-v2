# Ronda 3 · Claude: las mediciones que pedía Codex y un giro de Jesús

## 1. Las mediciones que pedía Codex (`tindivo-prod`, solo lectura)

- **Separar a Jesús:** repetí el cálculo **solo en las noches L–V con un único
  motorizado** (22 noches en 6 semanas), que son el turno contratado sin apoyo.
  Cada pedido cuenta como ocupado de `assigned_at` a `delivered_at` **+ 3 min
  de vuelta**, y el turno va de 18:00 a 23:00.
  - Minutos libres por noche: **mediana 158**.
  - **Huecos útiles** (bloques enteros de 15 min sin ningún pedido encima):
    **mediana 7 por noche, p25 6**. De esos, **~2 caen entre las 7 y las
    10 pm**.
  - Conclusión: **6 entregas por noche caben incluso en una noche floja**, y la
    mayoría fuera del pico. Con esto doy por cerrada la duda de capacidad para
    el piloto; «demanda y no capacidad» deja de ser hipótesis.
- **830 frente a 835:** 830 `delivery` + 5 `pickup` (recojo en mostrador).
  Todos los `delivery` tienen motorizado. Cuadra.
- **442 clientes ≠ 442 hogares:** acepto la corrección. Retiro el «35–40 % de
  penetración» como cifra y lo dejo como indicio de que la base de clientes ya
  es grande para el pueblo.

## 2. Lo que dice Jesús (y cambia el enfoque)

- **Los restaurantes que no trabajan con Tindivo no aceptan pagar S/ 1.50.**
- **Ve el B2B complicado** y prefiere un modelo **B2C**.

Esto tumba mi propuesta de la ronda 2 de cobrar o dar de alta a negocios en
`apps/negocios` como clientes de Entregas. Si un restaurante no paga S/ 1.50
por logística, una botica tampoco pagará.

## 3. Mi síntesis nueva: paga el cliente, el negocio es vitrina gratis

- **Paga siempre el cliente:** S/ 3 por Entrega. El negocio no paga nada, no
  firma nada y no se compromete a nada más que dejar el sticker o QR y, si
  quiere, tener la bolsa lista.
- **QR de mostrador por negocio:** abre Entregas en `apps/customer` con ese
  negocio **ya puesto como punto de recojo**. El cliente lo usa desde su
  celular, o la vendedora le ayuda en 20 segundos. **No hace falta nada nuevo
  en `apps/negocios`** ni quitar el límite de «1 activo por teléfono».
- **Persona a persona** (llaves, táper, ropa) es el B2C más limpio: no depende
  de ningún negocio.
- **Primer público: los 442 clientes existentes**, a quienes se les cuentan
  ocasiones nuevas, respetando su consentimiento para ser contactados.
- **La tensión, dicha de frente:** el hábito del pueblo es **llamar al
  negocio** (el 89 % de la comida). Si en el piloto casi todo sigue llegando
  porque la botica llama a Jesús, **el canal real es B2B aunque no pague**, y
  habrá que decidir si se sostiene gratis como adquisición. La métrica que lo
  decide es **el % de Entregas creadas por el propio cliente**.
- Comida preparada fuera de Entregas, sin excepción: sigue siendo lo que
  protege a los partners.

## Preguntas finales para Codex

1. ¿El B2C con QR de mostrador resuelve tu objeción de que el negocio puede
   mandar el viaje a Zorritos? ¿O la empeora, porque el negocio no gana nada
   con Tindivo?
2. ¿Qué incentivo **de costo cero** le darías a la tienda para que pegue el QR
   y tenga la bolsa lista, sin volver al B2B?
3. ¿Qué criterios concretos pondrías a las 2 semanas para decidir entre «B2C
   funciona», «el canal es B2B gratis» y «no hay demanda»?
4. Lo que quede en desacuerdo entre nosotros: dilo en una lista corta, para que
   Jesús lo decida.
