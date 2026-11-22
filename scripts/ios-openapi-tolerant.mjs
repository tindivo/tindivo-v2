#!/usr/bin/env node
// Deriva del contrato el documento que lee swift-openapi-generator en iOS (SW-7, CLI-2).
//
//   node scripts/ios-openapi-tolerant.mjs <entrada v1.json> <salida.json>
//
// Por qué: el contrato declara cerradas las respuestas (`additionalProperties: false` y enums cerrados), pero API-3
// permite añadir campos y valores. El cliente Swift generado con el contrato tal cual rechaza un campo nuevo o un
// valor nuevo de enum con `DecodingError` (medido el 2026-11-22). Android no lo nota porque su generador ignora las
// claves desconocidas por defecto.
//
// Solo toca las RESPUESTAS y `components.schemas`: lo que la app envía sigue validándose igual de estricto.
// Es un parche: la causa está en el contrato (DA-26). Cuando el contrato emita respuestas abiertas, este paso sobra.

import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: node scripts/ios-openapi-tolerant.mjs <entrada> <salida>')
  process.exit(2)
}

const doc = JSON.parse(readFileSync(input, 'utf8'))
let closedObjects = 0
let closedEnums = 0

function open(schema) {
  if (Array.isArray(schema)) return schema.map(open)
  if (schema === null || typeof schema !== 'object') return schema
  const out = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, open(v)]))
  if (out.additionalProperties === false) {
    delete out.additionalProperties
    closedObjects++
  }
  // El patrón «open enum» de la documentación del generador: un valor conocido o cualquier otra cadena.
  if (Array.isArray(out.enum) && out.type === 'string') {
    const { enum: values, nullable, description, ...rest } = out
    const known = values.filter((v) => v !== null)
    const wrapped = { anyOf: [{ ...rest, type: 'string', enum: known }, { type: 'string' }] }
    if (nullable) wrapped.nullable = true
    if (description) wrapped.description = description
    closedEnums++
    return wrapped
  }
  return out
}

for (const item of Object.values(doc.paths ?? {})) {
  for (const operation of Object.values(item)) {
    if (operation && typeof operation === 'object' && 'responses' in operation) {
      operation.responses = open(operation.responses)
    }
  }
}
if (doc.components?.schemas) doc.components.schemas = open(doc.components.schemas)

writeFileSync(output, JSON.stringify(doc, null, 2))
console.log(`Documento tolerante: ${closedObjects} objetos abiertos, ${closedEnums} enums abiertos → ${output}`)
