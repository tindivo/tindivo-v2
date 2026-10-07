/** Un contacto de quien entrega o quien recibe: lo que llena «Soy yo». */
export interface CourierContact {
  name: string
  /** Solo los 9 dígitos locales. */
  phone: string
}
