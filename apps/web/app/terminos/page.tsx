import { loadLegalDocument } from '@tindivo/legal'
import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal-document-view'

const doc = loadLegalDocument('terminos')

export const metadata: Metadata = {
  title: doc.title,
  description:
    'Condiciones de uso de Tindivo: pedidos, pagos por Yape, Plin y efectivo, y responsabilidades del cliente y del negocio.',
  alternates: { canonical: '/terminos/' },
}

export default function TerminosPage() {
  return <LegalDocumentView doc={doc} />
}
