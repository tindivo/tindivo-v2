import { ApiError } from '@tindivo/api-client'

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.problem.detail ?? e.message
  if (e instanceof Error) return e.message
  return 'Ocurrió un error inesperado'
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
