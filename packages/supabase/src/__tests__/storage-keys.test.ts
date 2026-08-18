import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../client-helpers'

/**
 * El `storageKey` decide el NOMBRE de la cookie donde vive la sesión. Es un
 * valor con dos propiedades que nada más comprueba, y que fallan en silencio:
 *
 *   · **Tienen que ser distintas entre apps.** Las cinco comparten dominio —en
 *     local solo cambia el puerto, en producción son subdominios de
 *     `tindivo.com`—, así que dos apps con la misma clave se pisan la sesión:
 *     entrar en el panel del negocio cambiaría la cuenta en la del motorizado.
 *
 *   · **No pueden cambiar.** Renombrar una clave no rompe nada visible en local
 *     ni en tests: simplemente, el día del despliegue nadie encuentra su cookie
 *     y TODOS los usuarios de esa app aparecen deslogueados a la vez. Es un
 *     cambio de una línea con radio de alcance total, y ningún tipo lo frena.
 *
 * De ahí que los valores estén escritos literalmente aquí. No es duplicación
 * ociosa: es la diferencia entre cambiarlos por accidente y cambiarlos a
 * propósito. Si este test se pone rojo, la pregunta no es «cómo lo arreglo»,
 * es «¿de verdad quiero desloguear a todo el mundo?».
 */
describe('STORAGE_KEYS', () => {
  it('cada app tiene la suya, sin repetidos', () => {
    const valores = Object.values(STORAGE_KEYS)
    expect(new Set(valores).size).toBe(valores.length)
  })

  it('los valores son exactamente los que hay desplegados', () => {
    expect(STORAGE_KEYS).toEqual({
      customer: 'tindivo-customer-auth',
      negocios: 'tindivo-negocios-auth',
      driver: 'tindivo-driver-auth',
      admin: 'tindivo-admin-auth',
    })
  })

  it('cubre las cuatro apps con sesión', () => {
    // `apps/api` no aparece: no tiene sesión propia de navegador.
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(['admin', 'customer', 'driver', 'negocios'])
  })
})
