-- 0149 · Apagar `nearby_address_burst`: en un pueblo NO distingue nada.
--
-- QUE HACIA. Marcaba `requires_validation` cuando llegaban 3 o mas pedidos a
-- menos de 200 m en 60 minutos, en el mismo negocio. La regla no mira el
-- telefono ni el cliente: cuenta pedidos CERCANOS ENTRE SI, sean de quien sean.
--
-- POR QUE SE APAGA. San Jacinto es un pueblo y el equilibrio del piloto son ~10
-- pedidos por noche concentrados en el centro. 200 m es media cuadra: tres
-- pedidos ahi dentro en una hora es una NOCHE BUENA, no un patron de fraude.
-- Cada disparo obliga a la cajera a llamar, y el coste real no es la llamada de
-- mas: es que aprenda a ignorar el aviso, y entonces el dia que sea de verdad
-- tampoco lo mire. Una alarma que suena siempre no es una alarma.
--
-- Visto en la practica el 2026-08-12: tres pedidos de prueba con la misma
-- direccion de entrega dispararon la regla al primer intento.
--
-- QUE SIGUE VIVO. Las otras tres reglas de rafaga, que si miran a una PERSONA o
-- al negocio entero, no a la geografia:
--   · same_phone_burst            (3+ pedidos del mismo telefono en 30 min)
--   · new_phone_high_ticket_burst (3+ telefonos estrenados esta noche, S/ 50+)
--   · order_spike                 (20+ pedidos/hora y mas del doble de la media)
-- Y los guards de contraentrega: cliente sin historial, con strike, o S/ 80+.
--
-- COMO SE APAGA, Y POR QUE ASI. Subiendo el umbral fuera de alcance, no tocando
-- la funcion. `create_customer_order` son 463 lineas y recrearla por segunda vez
-- en el mismo dia (ya la toco la 0148) es mucho riesgo para quitar un `count`
-- que en 10 pedidos/noche no cuesta nada. La consulta geografica se sigue
-- ejecutando y su resultado se descarta.
--
-- PARA VOLVER A ENCENDERLA no hace falta desplegar: es un UPDATE sobre
-- `app_settings`. Ese es justo el motivo de que el parametro viviera ahi
-- (CLAUDE.md: "parametros operativos en app_settings, no hardcode").
--
--   update public.app_settings
--      set value = value || '{"nearbyAddressThreshold": 3}'::jsonb
--    where key = 'validation';
--
-- Si algun dia se quiere quitar de verdad el `count`, es una migracion que
-- recree la funcion; hoy no compensa.

update public.app_settings
   set value = value || jsonb_build_object(
     'nearbyAddressThreshold', 9999,
     -- La nota viaja DENTRO del valor a proposito: `app_settings` no tiene
     -- columna de comentario, y el que lea un 9999 suelto en produccion sin
     -- explicacion al lado va a pensar que es un dedazo y lo va a "arreglar".
     'nearbyAddressDisabledNote',
       'Apagado en la 0149. 200 m es media cuadra del pueblo: 3 pedidos ahi en '
       || 'una hora es una noche buena, no fraude. Para reactivar, poner '
       || 'nearbyAddressThreshold en 3.'
   )
 where key = 'validation';
