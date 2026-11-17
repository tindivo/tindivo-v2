// Genera Docs/planes/app-cliente/matriz.md a partir de requisitos/*.md y pantallas/*.md.
// Uso: node scripts/spec-matriz.mjs  (se vuelve a correr tras cambiar un requisito o una pantalla)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = 'Docs/planes/app-cliente';
const reqDir = join(base, 'requisitos');
const scrDir = join(base, 'pantallas');

const screens = readdirSync(scrDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), text: readFileSync(join(scrDir, f), 'utf8') }));

const rows = [];
for (const file of readdirSync(reqDir).filter((f) => f.endsWith('.md')).sort()) {
  let cols = null;
  for (const line of readFileSync(join(reqDir, file), 'utf8').split('\n')) {
    if (!line.startsWith('|')) { cols = line.trim() === '' ? cols : null; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells[0] === 'ID') { cols = cells; continue; }
    if (!cols || !/^CUS-[A-Z]{3}-\d{3}/.test(cells[0])) continue;
    const id = cells[0].match(/^CUS-[A-Z]{3}-\d{3}/)[0];
    const star = cells[0].includes('★') ? '★' : '';
    const get = (name) => cells[cols.indexOf(name)] ?? '';
    const num = id.slice(-3);
    const area = id.slice(4, 7);
    const inScreens = screens
      .filter((s) => {
        if (s.text.includes(id)) return true;
        // rangos del tipo «CUS-CHK-001…020»
        for (const m of s.text.matchAll(new RegExp(`CUS-${area}-(\d{3})…(\d{3})`, 'g'))) {
          if (+num >= +m[1] && +num <= +m[2]) return true;
        }
        return false;
      })
      .map((s) => `\`${s.name}\``);
    rows.push(`| ${id} ${star} | ${get('Android')} | ${get('iOS')} | ${get('Móvil')} | ${inScreens.join(', ') || '—'} |`);
  }
}

const out = [
  '# App cliente — matriz de trazabilidad',
  '',
  '> **Generado** por `node scripts/spec-matriz.mjs` desde `requisitos/` y `pantallas/`: no se edita a mano.',
  '> Una fila por requisito: estado por plataforma, disposición móvil y pantallas que lo citan. Los endpoints viven en',
  '> cada pantalla (cabecera «Endpoints») y en la línea «Backend» de cada área. «—» en pantallas = ningún archivo lo cita.',
  '',
  '| Requisito | Android | iOS | Móvil | Pantallas |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  `Total: ${rows.length} requisitos · sin pantalla: ${rows.filter((r) => r.endsWith('| — |')).length}.`,
  '',
];
writeFileSync(join(base, 'matriz.md'), out.join('\n'));
console.log(`matriz.md: ${rows.length} requisitos`);
