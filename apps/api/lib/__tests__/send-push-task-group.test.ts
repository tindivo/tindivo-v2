import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withStartedTasks } from '../../../../supabase/functions/send-push/task-group.ts'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

async function sinRechazosSueltos() {
  await sleep(60)
  expect(unhandled).toEqual([])
}

describe('send-push · withStartedTasks (ninguna tarea queda sin manejador)', () => {
  beforeAll(() => {
    process.on('unhandledRejection', onUnhandled)
  })
  afterAll(() => {
    process.off('unhandledRejection', onUnhandled)
  })

  it('una tarea rechaza enseguida: rechaza con ese error, pero solo cuando las demás terminaron', async () => {
    let lentaTermino = false
    const errPrimera = new Error('primera')
    await expect(
      withStartedTasks<number, void>(async (start) => {
        start(Promise.reject(errPrimera))
        start(
          sleep(100).then(() => {
            lentaTermino = true
            return 2
          }),
        )
        start(Promise.resolve(3))
      }).then(
        () => {
          throw new Error('debía rechazar')
        },
        (e) => {
          expect(lentaTermino).toBe(true)
          throw e
        },
      ),
    ).rejects.toBe(errPrimera)
    await sinRechazosSueltos()
  })

  it('si body lanza, espera a que la tarea rechazada se asiente y relanza el error de body', async () => {
    let asentada = false
    const errBody = new Error('body')
    await expect(
      withStartedTasks<number, void>(async (start) => {
        start(
          sleep(30).then(() => {
            asentada = true
            throw new Error('tarea')
          }),
        )
        throw errBody
      }).catch((e) => {
        expect(asentada).toBe(true)
        throw e
      }),
    ).rejects.toBe(errBody)
    await sinRechazosSueltos()
  })

  it('si body lanza con una tarea lenta que resuelve, espera a que termine', async () => {
    let termino = false
    const errBody = new Error('body')
    await expect(
      withStartedTasks<number, void>(async (start) => {
        start(
          sleep(80).then(() => {
            termino = true
            return 1
          }),
        )
        throw errBody
      }).catch((e) => {
        expect(termino).toBe(true)
        throw e
      }),
    ).rejects.toBe(errBody)
    await sinRechazosSueltos()
  })

  it('camino feliz: valores en orden de inicio y result devuelto', async () => {
    const out = await withStartedTasks<number, string>(async (start) => {
      start(sleep(40).then(() => 1))
      start(Promise.resolve(2))
      start(sleep(10).then(() => 3))
      return 'listo'
    })
    expect(out).toEqual({ result: 'listo', values: [1, 2, 3] })
    await sinRechazosSueltos()
  })
})
