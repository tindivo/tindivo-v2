// La lógica de CORS vive en el paquete del backend (ADR 0039): una sola fuente.
export { corsHeaders, handleOptions } from '@tindivo/backend/http'
