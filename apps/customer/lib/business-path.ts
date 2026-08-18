/**
 * Ruta pública de un negocio, con el uuid como red.
 *
 * El slug (migración `0165`) es la forma buena de la URL, pero **no siempre
 * está ahí**, y el tipo no basta para saberlo: `apps/api` y `apps/customer` son
 * proyectos de Vercel distintos y no despliegan a la vez. Durante esa ventana,
 * un `customer` nuevo pide el catálogo a una `api` vieja que todavía no incluye
 * `slug` en sus columnas públicas, y `` `/negocio/${b.slug}` `` produce
 * literalmente `/negocio/undefined`: la portada pinta, pero no se puede entrar a
 * ningún negocio.
 *
 * El uuid sigue abriendo la página (`[id]` acepta las dos formas) y el front lo
 * redirige al slug con un 308 en cuanto la API lo manda. O sea: durante el
 * despliegue los enlaces son feos, pero funcionan. Sin este fallback, no.
 *
 * Un orden de despliegue documentado no resuelve esto —es una instrucción que
 * alguien tiene que recordar cada vez—; esto sí.
 */
export function businessPath(business: { slug?: string | null; id: string }): string {
  return `/negocio/${business.slug || business.id}`
}
