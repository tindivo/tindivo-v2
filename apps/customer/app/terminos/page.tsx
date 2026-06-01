import Link from 'next/link'

export const metadata = { title: 'Términos y Condiciones — Tindivo' }

const SECTIONS: { h: string; p: string }[] = [
  {
    h: '1. Qué es Tindivo',
    p: 'Tindivo es una plataforma intermediaria que conecta a clientes con negocios locales de San Jacinto (Áncash) y coordina la entrega a domicilio mediante motorizados. Tindivo NO produce los alimentos ni retiene los fondos del pedido: el pago (Yape/Plin/efectivo) va directo al negocio.',
  },
  {
    h: '2. Pedidos y confirmación',
    p: 'Al enviar un pedido aceptas que el negocio lo confirme antes de prepararlo. El negocio puede llamarte para validar tu primer pedido. Una vez que el negocio empieza a preparar, el pedido NO puede cancelarse.',
  },
  {
    h: '3. Pagos',
    p: 'Aceptamos Yape/Plin por adelantado, Yape/Plin al recibir y efectivo al recibir, según lo habilite cada negocio. Los pedidos de S/100 a más requieren prepago por Yape/Plin. Tú eres responsable de pagar el monto acordado al recibir tu pedido.',
  },
  {
    h: '4. Responsabilidad por tus datos',
    p: 'Eres responsable de proporcionar un número de teléfono y una dirección con referencia correctos. Si el motorizado no puede ubicarte o no respondes, el pedido puede cancelarse y registrarse una incidencia.',
  },
  {
    h: '5. Uso correcto y bloqueo',
    p: 'Tindivo puede bloquear el acceso a la contraentrega o suspender una cuenta ante uso fraudulento (p. ej. pedidos no recibidos reiterados anclados a un número o dirección). Dos incidencias de no-entrega bloquean el pago contraentrega; podrás seguir pidiendo con prepago.',
  },
  {
    h: '6. Fondo de contingencia',
    p: 'En casos puntuales Tindivo puede adelantar un reembolso al cliente cuando el negocio falla. Estos adelantos se registran y pueden ser revisados; no constituyen una obligación automática de Tindivo.',
  },
  {
    h: '7. Ley aplicable',
    p: 'Estos términos se rigen por las leyes de la República del Perú. Cualquier controversia se resolverá en la jurisdicción correspondiente a San Jacinto, Áncash.',
  },
  {
    h: '8. Soporte',
    p: 'Para cualquier consulta o incidencia, escríbenos por WhatsApp al número de soporte que aparece en la app.',
  },
]

export default function TerminosPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface px-5 pt-12 pb-16">
      <Link href="/entrar" className="t-eyebrow" style={{ letterSpacing: '0.14em' }}>
        ← Volver
      </Link>
      <h1 className="t-display mt-3 text-[28px]">Términos y Condiciones</h1>
      <p className="t-muted mt-1 text-[13px]">Versión 2026-05 · San Jacinto, Áncash</p>
      <div className="mt-6 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="t-display text-[17px]">{s.h}</h2>
            <p className="mt-1 text-[14px] leading-[1.55]" style={{ color: 'rgba(26,22,20,0.75)' }}>
              {s.p}
            </p>
          </section>
        ))}
      </div>
      <p className="t-muted mt-8 text-[12px]">
        Lee también nuestra{' '}
        <Link href="/privacidad" className="text-brand underline">
          Política de Privacidad
        </Link>
        .
      </p>
    </main>
  )
}
