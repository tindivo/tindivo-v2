import { describe, expect, it } from 'vitest'
import { must } from '../../../../supabase/functions/send-push/db-result.ts'

describe('send-push · must (una lectura fallida no es «cero destinatarios»)', () => {
  it('devuelve data cuando no hay error', () => {
    expect(must({ data: [{ user_id: 'a' }], error: null }, 'admins')).toEqual([{ user_id: 'a' }])
  })

  it('un resultado vacío legítimo (null o []) se devuelve sin lanzar', () => {
    expect(must({ data: null, error: null }, 'orders')).toBeNull()
    expect(must({ data: [], error: null }, 'admins')).toEqual([])
  })

  it('con error lanza, con el código y sin el mensaje de la base', () => {
    expect(() =>
      must(
        { data: null, error: { code: '42501', message: 'permission denied for table x' } },
        'admins',
      ),
    ).toThrow('[send-push] admins: 42501')
    expect(() =>
      must(
        { data: null, error: { code: '42501', message: 'permission denied for table x' } },
        'admins',
      ),
    ).not.toThrow(/permission denied/)
  })

  it('sin código usa sin_codigo', () => {
    expect(() => must({ data: null, error: { message: 'boom' } }, 'orders')).toThrow(
      '[send-push] orders: sin_codigo',
    )
  })
})
