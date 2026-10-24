import { describe, expect, it } from 'vitest'
import { pushUndeliveredText } from '../../../../supabase/functions/send-push/ops-alert.ts'

describe('send-push · pushUndeliveredText (aviso PushDeliveryFailed, 0272)', () => {
  it('con un conteo entero >= 1, lo dice', () => {
    const t = pushUndeliveredText(3)
    expect(t.title).toBe('Tindivo: avisos sin entregar')
    expect(t.body).toBe(
      'No se pudieron entregar 3 avisos en los últimos minutos. Revisa la bitácora de push.',
    )
  })

  it.each([
    0,
    -2,
    1.5,
    Number.NaN,
    '3',
    null,
    undefined,
    {},
    [],
    '<script>',
  ])('con %j (no es un entero >= 1) usa el texto sin número', (count) => {
    expect(pushUndeliveredText(count).body).toBe(
      'No se pudieron entregar algunos avisos en los últimos minutos. Revisa la bitácora de push.',
    )
  })
})
