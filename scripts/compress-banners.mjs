#!/usr/bin/env node

/**
 * Script reusable para comprimir imágenes de banners en apps/customer/public/banners.
 *
 * Utiliza sharp-cli para:
 * 1. Generar versiones .webp de alto rendimiento (calidad 85, reducción ~90-95%).
 * 2. Optimizar los archivos .png originales con reducción de paleta y compresión deflate.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BANNERS_DIR = path.resolve(__dirname, '../apps/customer/public/banners')

if (!fs.existsSync(BANNERS_DIR)) {
  console.error(`Directorio no encontrado: ${BANNERS_DIR}`)
  process.exit(1)
}

const files = fs.readdirSync(BANNERS_DIR).filter((f) => f.endsWith('.png'))

console.log(`Encontrados ${files.length} banners PNG en ${BANNERS_DIR}\n`)

let totalBefore = 0
let totalWebp = 0
let totalPngOpt = 0

for (const file of files) {
  const inputPath = path.join(BANNERS_DIR, file)
  const baseName = path.basename(file, '.png')
  const webpPath = path.join(BANNERS_DIR, `${baseName}.webp`)
  const tempPngPath = path.join(BANNERS_DIR, `${baseName}.tmp.png`)

  const beforeSize = fs.statSync(inputPath).size
  totalBefore += beforeSize

  console.log(`Procesando: ${file} (${(beforeSize / 1024).toFixed(1)} KB)`)

  // 1. Generar versión WebP (calidad 85)
  try {
    execSync(`npx -y sharp-cli -i "${inputPath}" -o "${webpPath}" -f webp -q 85`, {
      stdio: 'pipe',
    })
    const webpSize = fs.statSync(webpPath).size
    totalWebp += webpSize
    const webpPct = (((beforeSize - webpSize) / beforeSize) * 100).toFixed(1)
    console.log(`  -> WebP: ${(webpSize / 1024).toFixed(1)} KB (-${webpPct}%)`)
  } catch (err) {
    console.error(`  Error generando WebP para ${file}:`, err.message)
  }

  // 2. Optimizar PNG original
  try {
    execSync(
      `npx -y sharp-cli -i "${inputPath}" -o "${tempPngPath}" -f png --palette --effort 9 -q 85`,
      { stdio: 'pipe' },
    )
    if (fs.existsSync(tempPngPath)) {
      const optPngSize = fs.statSync(tempPngPath).size
      if (optPngSize < beforeSize) {
        fs.renameSync(tempPngPath, inputPath)
        totalPngOpt += optPngSize
        const pngPct = (((beforeSize - optPngSize) / beforeSize) * 100).toFixed(1)
        console.log(`  -> PNG optimizado: ${(optPngSize / 1024).toFixed(1)} KB (-${pngPct}%)`)
      } else {
        fs.unlinkSync(tempPngPath)
        totalPngOpt += beforeSize
        console.log(`  -> PNG original ya estaba optimizado.`)
      }
    }
  } catch (err) {
    if (fs.existsSync(tempPngPath)) fs.unlinkSync(tempPngPath)
    totalPngOpt += beforeSize
    console.error(`  Error optimizando PNG ${file}:`, err.message)
  }

  console.log('')
}

console.log('='.repeat(50))
console.log(`Total original:       ${(totalBefore / (1024 * 1024)).toFixed(2)} MB`)
console.log(
  `Total PNG optimizado: ${(totalPngOpt / (1024 * 1024)).toFixed(2)} MB (-${(((totalBefore - totalPngOpt) / totalBefore) * 100).toFixed(1)}%)`,
)
console.log(
  `Total WebP generado:  ${(totalWebp / (1024 * 1024)).toFixed(2)} MB (-${(((totalBefore - totalWebp) / totalBefore) * 100).toFixed(1)}%)`,
)
console.log('='.repeat(50))
