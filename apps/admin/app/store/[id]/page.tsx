'use client'

import { use } from 'react'
import { ProductForm } from '@/components/store/product-form'

/** Editar un borrador o un artículo ya publicado: cada cambio se guarda solo. */
export default function EditStoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ProductForm initialId={id} />
}
