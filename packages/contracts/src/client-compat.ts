import { z } from 'zod'

/**
 * Compatibilidad de las apps nativas con la API (contrato REST, paso 2).
 *
 * Las apps mandan quiénes son en cabeceras; la API las lee y, si la versión de
 * la app está por debajo del mínimo de SU app y SU plataforma, responde
 * `client_upgrade_required` (426). Quien no manda cabeceras —las PWAs de hoy—
 * no se evalúa nunca: este módulo no puede romper a un cliente web.
 *
 * Los mínimos viven en `app_settings.client_compat`, nunca en el código.
 */

export const CLIENT_HEADERS = {
  platform: 'x-tindivo-platform',
  app: 'x-tindivo-app',
  appVersion: 'x-tindivo-app-version',
  build: 'x-tindivo-build',
} as const

export const CLIENT_PLATFORMS = ['ios', 'android', 'web'] as const
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number]

/** Las apps que tienen versión mínima propia. */
export const CLIENT_APPS = ['customer', 'negocios', 'motorizados'] as const
export type ClientApp = (typeof CLIENT_APPS)[number]

/** Plataformas nativas: las únicas con versión mínima (la web siempre es la última). */
export const NATIVE_PLATFORMS = ['ios', 'android'] as const
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number]

export type Version = [number, number, number]

/**
 * `1`, `1.2`, `1.2.3`, con sufijo `-pre` o `+build` ignorado. Cualquier otra
 * cosa es `null`: una cabecera ilegible no es motivo para bloquear a nadie.
 */
export function parseVersion(raw: string): Version | null {
  const core = raw.trim().split(/[-+]/)[0] ?? ''
  const m = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?$/.exec(core)
  if (!m) return null
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const versionString = z.string().refine((v) => parseVersion(v) !== null, 'Versión inválida')

const perPlatform = z.object({ ios: versionString, android: versionString })

/** Forma de `app_settings.client_compat`. */
export const ClientCompatSettingsSchema = z.object({
  minAppVersion: z.object({
    customer: perPlatform,
    negocios: perPlatform,
    motorizados: perPlatform,
  }),
  /** Mínimos de sistema operativo (D-47): Android 8 = API 26, iOS 17. */
  minOs: z.object({
    android: z.number().int().positive(),
    ios: z.number().int().positive(),
  }),
})
export type ClientCompatSettings = z.infer<typeof ClientCompatSettingsSchema>

export interface ClientContext {
  platform: ClientPlatform | null
  app: string | null
  version: string | null
  build: string | null
}

/** `null` si la petición no trae NINGUNA cabecera de Tindivo (cliente web de hoy). */
export function parseClientContext(headers: {
  get(name: string): string | null
}): ClientContext | null {
  const platformRaw = headers.get(CLIENT_HEADERS.platform)?.trim().toLowerCase() ?? null
  const app = headers.get(CLIENT_HEADERS.app)?.trim().toLowerCase() || null
  const version = headers.get(CLIENT_HEADERS.appVersion)?.trim() || null
  const build = headers.get(CLIENT_HEADERS.build)?.trim() || null
  if (platformRaw === null && app === null && version === null && build === null) return null
  const platform = (CLIENT_PLATFORMS as readonly string[]).includes(platformRaw ?? '')
    ? (platformRaw as ClientPlatform)
    : null
  return { platform, app, version, build }
}

export type ClientVersionVerdict =
  | { ok: true }
  | {
      ok: false
      reason: 'client_outdated'
      minVersion: string
      platform: NativePlatform
      app: ClientApp
    }

/** Decide si la app es demasiado vieja. Ante cualquier duda, `ok`. */
export function evaluateClientVersion(
  ctx: ClientContext | null,
  settings: ClientCompatSettings,
): ClientVersionVerdict {
  if (!ctx?.version) return { ok: true }
  const { platform, app } = ctx
  if (platform !== 'ios' && platform !== 'android') return { ok: true }
  if (!(CLIENT_APPS as readonly string[]).includes(app ?? '')) return { ok: true }
  const appKey = app as ClientApp
  const current = parseVersion(ctx.version)
  const minRaw = settings.minAppVersion[appKey][platform]
  const min = parseVersion(minRaw)
  if (!current || !min) return { ok: true }
  if (compareVersions(current, min) >= 0) return { ok: true }
  return { ok: false, reason: 'client_outdated', minVersion: minRaw, platform, app: appKey }
}
