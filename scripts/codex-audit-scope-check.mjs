#!/usr/bin/env node
/**
 * Revisa una ronda de Codex en modo provisional (codex-worker.md §13.1 bis): lee el JSONL de
 * eventos de `codex exec --json` y marca todo lo que salga de la copia auditada.
 *
 *   node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>
 *
 * Sale con 0 si no hay nada que marcar y con 1 si hay algo: entonces la ronda NO vale y se trata
 * como incidente (§13.1 bis). Es DETECCIÓN, no prevención: un comando que arme una ruta por
 * partes o la lea de una variable puede escaparse. Por eso no convierte el modo en aislamiento.
 */
import { readFileSync } from 'node:fs'
import { resolve, win32 } from 'node:path'

const [eventsPath, auditRootArg] = process.argv.slice(2)
if (!eventsPath || !auditRootArg) {
  console.error('uso: node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>')
  process.exit(2)
}

const norm = (p) => win32.normalize(p.replaceAll('/', '\\')).replace(/\\+$/, '').toLowerCase()
const auditRoot = norm(resolve(auditRootArg))

/** Nombres que un auditor de esta copia no tiene por qué tocar, estén donde estén. */
const SENSITIVE =
  /auth\.json|\.env(?!\.example)\b|\.npmrc|\.git-credentials|\.ssh\b|\.supabase\b|\\appdata\b|\.claude\b|\.codex\b|id_rsa|id_ed25519|credentials?\b|cookies|login data|hosts\.yml|\.pgpass/i
/** Formas de llegar a otra ruta sin escribirla entera. */
const INDIRECT =
  /\$env:|%[a-z_]+%|\$home\b|~[\\/]|\.\.[\\/]|(^|\s)(cd|set-location|push-location|pushd)\s/i
/** Rutas absolutas de Windows dentro del comando. */
const ABSOLUTE = /[a-z]:\\[^"'\s|;&<>]*/gi

const findings = []
const lines = readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean)
for (const [n, line] of lines.entries()) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    findings.push(`línea ${n + 1}: JSON ilegible`)
    continue
  }
  if (event.type !== 'item.started') continue
  const item = event.item ?? {}
  if (item.type === 'agent_message' || item.type === 'reasoning') continue
  if (item.type !== 'command_execution') {
    findings.push(
      `${item.id}: herramienta no permitida en el modo provisional (${item.type} ${item.server ?? ''} ${item.tool ?? ''})`.trim(),
    )
    continue
  }
  // El primer token es el intérprete (powershell.exe); lo que importa es lo que le piden.
  const command = String(item.command ?? '').replace(/^"[^"]+"\s*|^\S+\s*/, '')
  if (SENSITIVE.test(command)) findings.push(`${item.id}: nombre sensible → ${command}`)
  if (INDIRECT.test(command))
    findings.push(`${item.id}: ruta indirecta o cambio de directorio → ${command}`)
  for (const path of command.match(ABSOLUTE) ?? []) {
    const p = norm(path)
    if (p !== auditRoot && !p.startsWith(`${auditRoot}\\`))
      findings.push(`${item.id}: ruta fuera de AUDIT_ROOT → ${path}`)
  }
}

if (findings.length === 0) {
  console.log(`OK · ${lines.length} eventos · ningún acceso fuera de ${auditRoot} detectado`)
  process.exit(0)
}
console.log(`MARCADO · ${findings.length} hallazgos · la ronda no vale (§13.1 bis)`)
for (const f of findings) console.log(`- ${f}`)
process.exit(1)
