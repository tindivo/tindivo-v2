-- 0223 · EN EL MOSTRADOR NO SE FÍA
--
-- Regla nueva del canal, dicha por el restaurante del piloto: un recojo llega a
-- cocina PAGADO. O el cliente sube su captura, o cancela en la caja ahí mismo.
--
-- ── QUÉ ESTABA ABIERTO ───────────────────────────────────────────────────────
--
-- `pending_yape` en un recojo entraba por las cuatro capas sin que ninguna se
-- quejara: el checkout pintaba las tres opciones siempre (constante estática,
-- sin mirar el método), el contrato no cruzaba pago con método, la API trataba
-- `pending_cash` y `pending_yape` como lo mismo, y `create_customer_order` solo
-- tenía guard para `pending_mixed`. Comprobado creando uno a mano contra la
-- RPC: salió `pending_acceptance` sin una queja.
--
-- No era un agujero de fraude —nadie cocina hasta que la cajera acepta— pero
-- era peor de otra forma: FUNCIONABA POR ACCIDENTE. `pending_yape` significa
-- una cosa física y concreta, que el cliente le transfiera AL MOTORIZADO al
-- recibir la bolsa. En un mostrador no hay motorizado. La tarjeta acababa
-- diciendo «Cobrar con Yape/Plin», la cajera cobraba en la caja, y el sistema
-- reinterpretaba en silencio una opción inexistente como otra que sí existe.
--
-- Y el hueco de verdad estaba al lado: un recojo «más tarde» en contraentrega
-- se cocina SIN NADIE DELANTE y SIN CAJA A LA QUE COBRARLE. Si el cliente no
-- aparece, el negocio se comió el plato. Es el único camino del sistema donde
-- se fía comida sin que nadie pueda cobrarla después.
--
-- ── LO QUE QUEDA ─────────────────────────────────────────────────────────────
--
--   recojo «ahora»      -> caja (efectivo o Yape, contra el QR del local) o prepago
--   recojo «más tarde»  -> prepago y punto
--   delivery            -> sin cambios; ahí el motorizado existe
--
-- ── POR QUÉ UN CHECK Y NO UN `raise` DENTRO DE LA FUNCIÓN ────────────────────
--
-- Mismo razonamiento que `orders_pickup_timing_chk` (0220), y mismo reparto de
-- papeles: el mensaje legible lo da el `.refine` del contrato ANTES de llamar a
-- nada, y esto es el suelo por si alguien llega a la RPC sin pasar por ahí. Un
-- CHECK protege además a cualquier escritor futuro, cosa que un `raise` metido
-- en una sola función no hace — y evita recrear las ~700 líneas de
-- `create_customer_order` para colar cuatro condiciones.
--
-- ── SOLO EL CANAL DEL CLIENTE, Y NO ES UN OLVIDO ─────────────────────────────
--
-- `create_business_manual_order` también recibe `delivery_method`. Un recojo
-- manual cobrado por Yape es legítimo: la cajera tuvo el dinero en la mano
-- ANTES de crear la fila, así que el pedido ya nace pagado por otra vía. Y un
-- recojo manual para más tarde, a pagar en caja, es una decisión del negocio
-- sobre un cliente que conoce por teléfono — no es de Tindivo prohibirla.
-- Un CHECK sin condicionar por `source` rompería las dos.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_pickup_payment_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_payment_chk CHECK (
    source <> 'customer_pwa'
    OR delivery_method <> 'pickup'
    OR (
      -- (a) NADA DE «YAPE AL RECIBIR» EN UN MOSTRADOR. No hay a quién.
      payment_intent <> 'pending_yape'
      -- (b) SIN NADIE DELANTE, NO SE FÍA. `pickup_timing` es NOT NULL para este
      --     origen por el CHECK de la 0220, así que el `IS NULL` de aquí no es
      --     una rama viva: está para que este CHECK siga siendo cierto por sí
      --     solo si alguna vez se relaja aquel, en vez de dejar pasar todo un
      --     recojo sin timing por el hueco de un NULL.
      AND (pickup_timing IS NULL
           OR pickup_timing <> 'later'
           OR payment_intent = 'prepaid')
    )
  ) NOT VALID;

-- NOT VALID + VALIDATE en dos pasos, igual que la 0220: el segundo toma un lock
-- más suave y, si alguna fila no cumpliera, falla diciendo cuál en vez de
-- bloquear la tabla entera. Medido antes de escribir esto: 0 recojos de
-- `customer_pwa` en la base, así que valida en seco.
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_pickup_payment_chk;

COMMENT ON CONSTRAINT orders_pickup_payment_chk ON public.orders IS
  'Recojo del canal cliente: nada llega a cocina fiado. Sin «Yape al recibir» '
  '(no hay motorizado a quien transferirle) y, si el cliente pasa más tarde, '
  'prepago obligatorio (no hay nadie a quien cobrarle en la caja). El espejo en '
  'TypeScript es `customerPaymentIntents` en @tindivo/contracts: si cambias uno, '
  'cambia el otro. No aplica a `business_manual`: ahí la cajera ya cobró.';
