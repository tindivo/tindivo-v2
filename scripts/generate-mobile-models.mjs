/**
 * Genera los MODELOS (solo tipos de datos, sin cliente HTTP) de las apps nativas desde el contrato
 * `packages/contracts/openapi/v1.json`, y opcionalmente comprueba que compilan.
 *
 *   pnpm mobile:models kotlin            # genera en build/mobile-models/kotlin
 *   pnpm mobile:models kotlin --compile  # y compila con Gradle (hace falta JDK 17+ y gradle)
 *   pnpm mobile:models swift --compile   # y compila con `swift build` (solo macOS/Linux con Swift)
 *   opciones: --out <dir>
 *
 * Los modelos generados NO se versionan (`build/` está en .gitignore): se generan en la CI. Plan: MV2c,
 * Docs/planes/movil/decisiones.md D-48 (Kotlin en cada PR, Swift a diario).
 *
 * Todo va fijado a una versión exacta: el generador (con su sha256), el plugin de Kotlin y la serialización.
 * Subir cualquiera es un cambio aparte, que se prueba en su propio PR.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GENERATOR_VERSION = '7.14.0'
const GENERATOR_SHA256 = 'e03186835022ca02da4aa95e3967b6a3b6d44c2e5f7606e6d5c22466f519c757'
const GENERATOR_URL = `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${GENERATOR_VERSION}/openapi-generator-cli-${GENERATOR_VERSION}.jar`
const KOTLIN_VERSION = '2.2.20'
const KOTLINX_SERIALIZATION_VERSION = '1.9.0'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const spec = join(root, 'packages/contracts/openapi/v1.json')
const cacheDir = join(root, 'build/mobile-models/.tools')
const jar = join(cacheDir, `openapi-generator-cli-${GENERATOR_VERSION}.jar`)

const [target, ...flags] = process.argv.slice(2)
if (target !== 'kotlin' && target !== 'swift') {
  console.error('Uso: node scripts/generate-mobile-models.mjs <kotlin|swift> [--compile] [--out <dir>]')
  process.exit(2)
}
const compile = flags.includes('--compile')
const outFlag = flags.indexOf('--out')
const out = resolve(outFlag >= 0 ? flags[outFlag + 1] : join(root, 'build/mobile-models', target))

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

async function ensureGenerator() {
  if (existsSync(jar) && sha256(jar) === GENERATOR_SHA256) return
  mkdirSync(cacheDir, { recursive: true })
  console.log(`Descargando openapi-generator-cli ${GENERATOR_VERSION}...`)
  const res = await fetch(GENERATOR_URL)
  if (!res.ok) throw new Error(`No se pudo descargar el generador: HTTP ${res.status}`)
  writeFileSync(jar, Buffer.from(await res.arrayBuffer()))
  const got = sha256(jar)
  if (got !== GENERATOR_SHA256) {
    rmSync(jar)
    throw new Error(`sha256 del generador no coincide: esperado ${GENERATOR_SHA256}, obtenido ${got}`)
  }
}

function run(cmd, args, cwd = root) {
  // shell solo en Windows, donde `gradle` es un .bat; los argumentos no llevan espacios ni metacaracteres.
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`✖ falló: ${cmd} ${args.join(' ')} (código ${r.status ?? r.error?.message})`)
    process.exit(r.status || 1)
  }
}

function generatorArgs() {
  const base = ['-jar', jar, 'generate', '-i', spec, '-o', out]
  if (target === 'kotlin') {
    return [
      ...base,
      '-g',
      'kotlin',
      // Solo modelos. Dinero nuevo ya llega como string en el contrato (D-39) y queda String.
      '--global-property',
      'models,modelDocs=false,modelTests=false',
      '--additional-properties',
      'library=jvm-okhttp4,serializationLibrary=kotlinx_serialization,packageName=com.tindivo.api,modelPackage=com.tindivo.api.models,enumPropertyNaming=UPPERCASE',
      // Los objetos de forma libre (`metadata`) salen como `Map<String, Any>`, y `Any` no tiene serializador: el plugin
      // de kotlinx.serialization revienta con un error interno del compilador. JsonElement sí es serializable.
      '--type-mappings',
      'AnyType=JsonElement',
      '--import-mappings',
      'JsonElement=kotlinx.serialization.json.JsonElement',
    ]
  }
  return [
    ...base,
    '-g',
    'swift6',
    // Los modelos de swift6 dependen de los ficheros de Infrastructure (CodableHelper, JSONValue...), por eso
    // supportingFiles; los APIs (cliente HTTP) no se generan.
    '--global-property',
    'models,supportingFiles,modelDocs=false,modelTests=false',
    '--additional-properties',
    'projectName=TindivoModels,useSPMFileStructure=true,library=urlsession',
  ]
}

function writeKotlinBuild() {
  writeFileSync(
    join(out, 'settings.gradle.kts'),
    'rootProject.name = "tindivo-models"\n',
  )
  writeFileSync(
    join(out, 'build.gradle.kts'),
    `plugins {
    kotlin("jvm") version "${KOTLIN_VERSION}"
    kotlin("plugin.serialization") version "${KOTLIN_VERSION}"
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:${KOTLINX_SERIALIZATION_VERSION}")
}
`,
  )
}

await ensureGenerator()
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// El generador escribe mucho en stdout; solo se enseña si falla.
const gen = spawnSync('java', generatorArgs(), { cwd: root, encoding: 'utf8' })
if (gen.status !== 0) {
  process.stderr.write(gen.stdout ?? '')
  process.stderr.write(gen.stderr ?? '')
  console.error('✖ el generador falló')
  process.exit(gen.status || 1)
}
console.log(`✔ modelos de ${target} generados en ${out}`)

if (target === 'kotlin') writeKotlinBuild()

if (compile) {
  if (target === 'kotlin') {
    run('gradle', ['--no-daemon', '--console=plain', 'compileKotlin'], out)
  } else {
    run('swift', ['build', '--package-path', out])
  }
  console.log(`✔ los modelos de ${target} compilan`)
}
