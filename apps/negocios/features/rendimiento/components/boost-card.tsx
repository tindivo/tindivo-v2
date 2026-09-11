'use client'

import type { PerformanceBoost } from '@tindivo/core'
import { Button, Card, Icon } from '@tindivo/ui'
import { formatSupportPhone, normalizeSupportPhone, supportWhatsappUrl } from '@/lib/support'

/**
 * La mano que Tindivo le tiende al negocio cuando el periodo vino flojo.
 *
 * SOLO APARECE CUANDO EL ÁNIMO LA PIDE (`buildBoost` devuelve `null` si no).
 * Enseñársela también al que está batiendo su récord la convierte en publicidad
 * de fondo, y la próxima vez que salga de verdad ya nadie la mirará.
 *
 * NO PROMETE NINGÚN BOTÓN. Todo lo que ofrece lo hace una persona por WhatsApp,
 * porque hoy no existe otra cosa: no hay tabla de promociones ni forma de
 * destacar un local en el catálogo (`/public/businesses` ordena por nombre). Un
 * «crear promoción» que llevara a una pantalla vacía se descubre al primer clic
 * y quema lo único que Tindivo tiene con estos negocios, que es la confianza.
 *
 * SIN NÚMERO CONFIGURADO NO HAY BOTÓN. Mismo criterio que el escalamiento del
 * tablero (`lib/support.ts`): antes había un fallback hardcodeado, así que una
 * configuración rota abría WhatsApp igual y nadie se enteraba. Aquí, si
 * `app_settings.support_whatsapp` no sirve, se enseña la tarjeta sin CTA en vez
 * de un botón que no lleva a nadie.
 */
export function BoostCard({
  boost,
  supportPhone,
}: {
  boost: PerformanceBoost
  supportPhone: string | null
}) {
  const digits = normalizeSupportPhone(supportPhone)

  return (
    <Card className="border border-brand/25 bg-brand-soft p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-[26px] leading-none">
          💚
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-brand-dark">{boost.headline}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{boost.body}</p>
        </div>
      </div>

      <ul className="mt-3.5 flex flex-col gap-2">
        {boost.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
            <Icon name="check_circle" size={15} className="mt-0.5 shrink-0 text-brand" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {digits ? (
        <>
          <Button
            as="a"
            href={supportWhatsappUrl(digits, boost.whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full"
          >
            <Icon name="chat" size={17} />
            Conversemos cómo levantarlo
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-muted">
            Te escribe una persona, no un bot · {formatSupportPhone(digits)}
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-card/70 p-3 text-center text-[11px] text-ink-muted">
          Escríbenos por WhatsApp y lo vemos contigo.
        </p>
      )}
    </Card>
  )
}
