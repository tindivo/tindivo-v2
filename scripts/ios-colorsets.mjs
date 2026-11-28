// Genera los colorsets del catálogo de assets de iOS desde packages/design-tokens/tokens.json, para no duplicar
// valores. Salida: <catálogo>/Generated/{AccentColor,LaunchBackground}.colorset (no se versiona).
//   node scripts/ios-colorsets.mjs <tokens.json> <Assets.xcassets>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [tokensPath, catalogPath] = process.argv.slice(2)
if (!tokensPath || !catalogPath) {
  console.error('Uso: node scripts/ios-colorsets.mjs <tokens.json> <Assets.xcassets>')
  process.exit(1)
}

const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')).color
// AccentColor tiñe los controles del sistema: el primario de marca. El fondo de arranque es el fondo de la app.
const colorsets = { AccentColor: 'primary', LaunchBackground: 'background' }

const out = join(catalogPath, 'Generated')
rmSync(out, { recursive: true, force: true })
for (const [name, token] of Object.entries(colorsets)) {
  const hex = tokens[token]?.value
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex ?? '')) throw new Error(`Token de color «${token}» ausente o no es #RRGGBB`)
  const channel = (i) => (Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255).toFixed(3)
  const dir = join(out, `${name}.colorset`)
  mkdirSync(dir, { recursive: true })
  const contents = {
    colors: [
      {
        color: {
          'color-space': 'srgb',
          components: { alpha: '1.000', blue: channel(2), green: channel(1), red: channel(0) },
        },
        idiom: 'universal',
      },
    ],
    info: { author: 'xcode', version: 1 },
  }
  writeFileSync(join(dir, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`)
}
