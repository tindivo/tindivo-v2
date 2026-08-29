import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Resolución del alias `@/*` que declara `apps/api/tsconfig.json`.
 *
 * Hace falta para los tests que ejercitan un route handler de Next: el handler
 * se importa como un módulo normal, pero por dentro hace
 * `import ... from '@/lib/http/auth'` y vitest —que no lee los `paths` del
 * tsconfig— fallaba con "Cannot find package '@/lib/http/auth'".
 */
const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    /**
     * Barre los mundos de test que dejó una corrida abortada — al arrancar y al
     * terminar. Los helpers ya limpian lo suyo, pero su `afterAll` no corre si
     * matas el proceso; barrer en el SETUP es lo único que impide que la basura
     * de la corrida anterior sobreviva a la siguiente. Detalle en el fichero.
     */
    globalSetup: ['./vitest.global-setup.ts'],

    /**
     * ESTOS TESTS SON DE INTEGRACIÓN CONTRA UNA ÚNICA BASE DE DATOS.
     *
     * No comparten un mock: comparten `postgres`. Ejecutar los archivos en
     * paralelo significa varios ficheros creando, entregando y liquidando
     * pedidos sobre las mismas tablas a la vez, y eso produjo dos síntomas
     * distintos que costaron media tarde distinguir:
     *
     *   1. Toda la familia del ledger (A1.x, A2.x) rozando el presupuesto de
     *      5s por contención. Medido: A1.3, A2.2 y A2.3 fallando a 5.01–5.03s,
     *      y A1.1/A1.5/A2.1 entre 3.2s y 4.6s — o sea al 90% del límite incluso
     *      cuando pasaban. No eran tests frágiles: era presupuesto mal
     *      calibrado bajo carga.
     *
     *   2. `reconciliation.integration.test.ts` fallando con "ningún negocio
     *      tiene el saldo desalineado del ledger". Ese test recorre TODOS los
     *      negocios comprobando `balance_due = SUM(cargos pending)`, así que en
     *      paralelo veía el estado intermedio de otro fichero a mitad de
     *      liquidación. Aislado pasa, y la base no tenía ni una fila
     *      desalineada: era un FALSO POSITIVO.
     *
     * El segundo es el que obliga. Un falso positivo de "el ledger está
     * desalineado" es la alarma que menos puede mentir: si suena en falso, se
     * deja de mirar, y el día que el ledger se desalinee de verdad nadie
     * levantará la vista.
     *
     * Serializar los ficheros cuesta unos segundos de suite. Un test de
     * invariante financiera que no se cree nadie cuesta bastante más.
     */
    fileParallelism: false,

    /**
     * 15s en vez de los 5s por defecto. Con los ficheros ya serializados casi
     * ningún test lo necesita —los del ledger bajan a menos de 1s—, pero el
     * margen evita que un entorno más lento (CI, un portátil cargado) vuelva a
     * convertir la contención en rojos intermitentes.
     */
    testTimeout: 15_000,

    /**
     * `hookTimeout` se quedó en los 10s por defecto cuando `testTimeout` subió
     * a 15s, y eso es justo al revés de lo que estas suites necesitan: el hook
     * hace MÁS trabajo que cualquier test suyo.
     *
     * Un `beforeAll`/`afterAll` de integración no ejercita un endpoint: monta y
     * desmonta un mundo. El de `promo-free-delivery` restaura `app_settings`,
     * borra pedidos, redenciones, la sede 2 con su carta, y luego recorre los
     * clientes que creó llamando a `auth.admin.deleteUser` UNO A UNO. Ese
     * bucle crece con cada test que añada un cliente, y cada borrado de Auth
     * es una llamada de red.
     *
     * Medido el 2026-08-28: ese `afterAll` pasó de los 10s y tumbó el fichero
     * entero —`Hook timed out in 10000ms`— con sus 17 tests en verde. Un rojo
     * de suite cuyos tests pasan todos apunta al sitio equivocado: se busca el
     * fallo en la lógica de la promo y no está ahí.
     *
     * No se arregla en la suite con un timeout suelto porque no es un problema
     * de esa suite: es el techo de todos los teardown de integración, y la
     * siguiente que crezca lo va a tocar igual.
     */
    hookTimeout: 30_000,
  },
})
