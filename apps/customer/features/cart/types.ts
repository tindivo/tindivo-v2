export type CartLayout = 'row' | 'block'
/**
 * `light` sobre el lienzo crema, `dark` sobre un fondo oscuro plano, y
 * `on_photo` cuando el botón flota SOBRE una imagen: ahí los dos anteriores
 * fallan —el translúcido claro se pierde en una foto clara y el oscuro se
 * pierde en una nocturna—, así que se pinta un círculo blanco opaco con
 * sombra, que es lo que hace cualquier app del gremio.
 */
export type CartButtonTone = 'light' | 'dark' | 'on_photo'
