# Optimización del flujo del cliente · Claude (con la propuesta de Jesús)

## Lo que vio Jesús probando en local

- Llenó todo y al final salió «Ingresa con tu celular para continuar»: sin
  sesión, «Pedir» no abre el login, y además lo dice al final.
- Son **5 pantallas**: mapa A → mapa B → «Confirma tu pedido» (4 campos de
  contacto, abrumadora) → «¿Quién paga?» → «¿Qué llevamos?».
- El botón de ubicación (una mira) no se reconoce como «mi ubicación».

## Propuesta: 3 pantallas

1. **Mapa A** (igual; arranca en la ubicación actual si hay GPS). Botón con
   el icono de flecha de «mi ubicación».
2. **Mapa B** (igual).
3. **Una sola pantalla «Detalles»**, en este orden:
   - **Quién entrega / Quién recibe:** una fila por persona. «Soy yo» la llena
     en un toque; si no, nombre y celular en la misma fila.
   - **¿Qué es?** chips: **Documentos · Paquete · Medicinas · Ropa · Otro**,
     más una descripción corta opcional.
   - **¿Quién paga los S/ 3?** dos botones en línea (antes, una pantalla entera).
   - **Nota para el motorizado** (opcional), con ejemplo: «Está a nombre de
     María. Cuidado, es frágil.» Reemplaza el interruptor «Es frágil» y
     resuelve el «¿a nombre de quién?» en los pedidos de WhatsApp.
   - Abajo, fijos: la casilla «Ya está listo y pagado…» y «Pedir entrega · S/ 3».
4. **El login se pide al entrar a Entregas**, no al final: el borrador vive en
   memoria y el regreso de Google recarga la página.

## Punto a decidir

Jesús pidió «Comida» en lugar de «Paquete». Choca con una regla cerrada: **la
comida preparada no va por Entregas** (protege a los partners). Propongo no
poner «Comida» y dejar «Paquete».

## Técnico

- Columna nueva `courier_orders.driver_note` (≤ 140) y parámetro
  `p_driver_note` en `create_courier_order`, en la `0235` (aún no aplicada en
  producción). Hay que borrar la firma vieja para no dejar dos versiones
  (overload) y volver a aplicar los `revoke` de la `0233`.
- La tarjeta del motorizado muestra la nota.
