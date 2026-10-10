# Preguntas para Jesús: área de plataforma

> 2026-10-10 · Salen de escribir `Docs/negocio/plataforma.md` y `Docs/glosario.md` contra `tindivo-prod` (solo
> lectura). Según el estándar §4, cuando el código y un documento no coinciden, Claude no elige: pregunta. Cada
> pregunta trae su recomendación. Este archivo se borra cuando estén respondidas.

## 1. La comisión por pedido con entrega: ¿S/ 1.00 o S/ 1.50?

- `DECISIONS.md §4` dice **S/ 1.00** («S/1 de comisión; el delivery lo paga el cliente»).
- `tindivo-prod` cobra **S/ 1.50**: `app_settings.commissions = {delivery: 1.5, pickup: 1}`, sin excepciones por
  negocio (`commission_override_delivery` vacío en los cuatro).
- El debate de ingresos del 7-oct menciona que los no aliados «ya dijeron que no a S/ 1.50», lo que sugiere que 1.50 es
  el precio vigente a propósito.

**Recomendación:** S/ 1.50 es lo vigente; se corrige `§4` y se registra cuándo y por qué subió. **¿Cuándo pasó de 1.00
a 1.50, y fue decisión tuya?**

## 2. Datos del negocio que la base no guarda

`DECISIONS.md §4` afirma dos cosas que no se pueden comprobar en la base:

- El motorizado cobra **sueldo fijo, ~S/ 30 por noche**, no por entrega.
- El **punto de equilibrio** es de **~10 pedidos por noche**.

Hoy hay tres motorizados y ~17 pedidos entregados por noche de media en 30 días (497). **¿Siguen valiendo esas dos
cifras?** Si sí, entran en `negocio/dinero.md` como dato tuyo con fecha; si no, con las nuevas.

## 3. Pollería Nadia

Figura como **solo catálogo** y `uses_tindivo_drivers = false`, pero tiene **87 pedidos entregados en 30 días**
registrados en Tindivo. **¿Quién los entrega: sus propios repartidores o los motorizados de Tindivo?** Cambia cómo se
le cobra y cómo se cuenta la carga de los motorizados. (Se revisa a fondo en el área de dinero.)

## Lo que ya no es pregunta (documentación vieja, corregida en el canon)

- `CLAUDE.md` y la visión decían «1 restaurante (La Florencia), 1 motorizado»: hoy son cuatro aliados y tres
  motorizados.
- `FASE-1-TINDIVO.md` daba el **fondo de contingencia** como «única excepción» a no retener fondos: se eliminó en la
  `0123` (comprobado: no quedan ni la tabla ni sus funciones). `DECISIONS.md §9` está obsoleto.
- `DECISIONS.md §4` decía que el recojo cobraba S/ 0.50; ya estaba corregido a S/ 1.00 en el propio §4, y coincide con
  producción.
