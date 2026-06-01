import Link from 'next/link'

export const metadata = { title: 'Política de Privacidad — Tindivo' }

const SECTIONS: { h: string; p: string }[] = [
  {
    h: '1. Quién trata tus datos',
    p: 'Tindivo, operando en San Jacinto (Áncash), trata tus datos personales conforme a la Ley N.° 29733 de Protección de Datos Personales del Perú y su reglamento.',
  },
  {
    h: '2. Qué datos recolectamos',
    p: 'Recolectamos tu nombre, número de teléfono, correo, direcciones de entrega con sus referencias y el historial de tus pedidos. No recolectamos datos de tarjetas: los pagos son por Yape/Plin o efectivo directo al negocio.',
  },
  {
    h: '3. Para qué los usamos',
    p: 'Usamos tus datos únicamente para procesar y entregar tus pedidos, contactarte sobre el estado del pedido, prevenir fraude y mejorar el servicio. Tu teléfono solo es visible para el negocio del pedido y el motorizado asignado.',
  },
  {
    h: '4. Con quién los compartimos',
    p: 'Compartimos los datos mínimos necesarios con el negocio que preparas tu pedido y con el motorizado que lo entrega. No vendemos ni cedemos tus datos a terceros con fines publicitarios.',
  },
  {
    h: '5. Tus derechos (ARCO)',
    p: 'Puedes solicitar acceso, rectificación, cancelación u oposición sobre tus datos escribiéndonos por WhatsApp al número de soporte. Atenderemos tu solicitud en los plazos que marca la ley.',
  },
  {
    h: '6. Conservación y seguridad',
    p: 'Conservamos tus datos mientras tu cuenta esté activa y el tiempo necesario para cumplir obligaciones legales. Aplicamos medidas de seguridad (control de acceso por roles, cifrado en tránsito) para protegerlos.',
  },
  {
    h: '7. Contacto',
    p: 'Para ejercer tus derechos o resolver dudas sobre privacidad, contáctanos por el WhatsApp de soporte de la app.',
  },
]

export default function PrivacidadPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface px-5 pt-12 pb-16">
      <Link href="/entrar" className="t-eyebrow" style={{ letterSpacing: '0.14em' }}>
        ← Volver
      </Link>
      <h1 className="t-display mt-3 text-[28px]">Política de Privacidad</h1>
      <p className="t-muted mt-1 text-[13px]">Versión 2026-05 · Ley N.° 29733 (Perú)</p>
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
        Lee también nuestros{' '}
        <Link href="/terminos" className="text-brand underline">
          Términos y Condiciones
        </Link>
        .
      </p>
    </main>
  )
}
