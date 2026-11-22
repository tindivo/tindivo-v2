import { loadLegalDocument } from '@tindivo/legal'
import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal-document-view'

const doc = loadLegalDocument('privacidad')

export const metadata: Metadata = {
  title: doc.title,
  description:
    'Qué datos guarda Tindivo, para qué los usa y cómo ejercer tus derechos sobre ellos.',
  alternates: { canonical: '/privacidad/' },
}

export default function PrivacidadPage() {
  return <LegalDocumentView doc={doc} />
}
