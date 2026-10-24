// Tareas que arrancan antes de esperarse, sin imports de Deno para poder probarlas desde vitest
// (apps/api/lib/__tests__/send-push-task-group.test.ts).
//
// Si una promesa se guarda para esperarla después, un rechazo que ocurre antes de esa espera (o
// mientras se espera otra cosa) queda sin manejador. `withStartedTasks` les pone un manejador en
// el acto y garantiza que, pase lo que pase en `body`, todas las tareas se asientan antes de
// devolver o relanzar: ninguna sigue corriendo en segundo plano tras responder.

export async function withStartedTasks<T, R>(
  body: (start: (task: Promise<T>) => void) => Promise<R>,
): Promise<{ result: R; values: T[] }> {
  const tasks: Promise<T>[] = []
  const start = (task: Promise<T>): void => {
    task.catch(() => {})
    tasks.push(task)
  }
  let result: R
  try {
    result = await body(start)
  } catch (e) {
    await Promise.allSettled(tasks)
    throw e
  }
  const settled = await Promise.allSettled(tasks)
  const values: T[] = []
  for (const s of settled) {
    if (s.status === 'rejected') throw s.reason
    values.push(s.value)
  }
  return { result, values }
}
