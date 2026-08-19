/**
 * El umbral de prepago, en un solo sitio.
 *
 * POR QUÉ SUBE A `lib/` Y NO SE QUEDA EN `features/checkout/`.
 *   Porque lo necesitan DOS sitios que no se conocen: la pantalla de pago, que
 *   lo aplica, y los términos y condiciones, que lo prometen. Mientras cada uno
 *   tuvo su propio número, discreparon — y lo hicieron durante meses:
 *
 *     · `0057` bajó `app_settings.prepay_threshold` de 100 a 80.
 *     · El checkout siguió al ajuste, porque lo lee de la base.
 *     · Los términos se quedaron diciendo «Los pedidos de S/100 a más
 *       requieren prepago», que es lo que leyó todo el que se registró desde
 *       entonces.
 *
 *   La discrepancia iba en la dirección mala: el sistema exigía prepago a los
 *   S/80 mientras el texto público prometía que solo a partir de S/100. O sea
 *   una condición aplicada por encima de lo divulgado, que en Perú no es un
 *   detalle cosmético.
 *
 * ESTO ES UN FALLBACK, NO LA VERDAD.
 *   La verdad vive en `app_settings.prepay_threshold` y **se edita desde
 *   /admin/configuracion** (`apps/admin/app/configuracion/page.tsx:142`). El
 *   checkout lee la base y usa este valor solo mientras la consulta no vuelve.
 *
 *   Los términos, en cambio, son un documento estático: no consultan nada. Así
 *   que si alguien cambia el umbral DESDE EL PANEL, el texto vuelve a
 *   desalinearse y esta constante no lo impide — solo impide que dos números
 *   escritos a mano en el repo discrepen entre sí.
 *
 *   Quien toque el umbral desde el panel tiene que actualizar aquí también, o
 *   sacar el número del texto legal y remitir al importe que la pantalla de
 *   pago ya muestra en el momento en que aplica.
 */
export const DEFAULT_PREPAY_THRESHOLD = 80
