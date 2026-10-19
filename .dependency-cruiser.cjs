/**
 * Fronteras de arquitectura (ADR 0039; estándares DES-4, DES-9, DES-11, TS-4, TS-14).
 * Se corre con `pnpm check:deps`, en el job de lint de CI.
 *
 * `$1` en `pathNot` es el nombre del módulo capturado en `from.path`.
 */
const BACKEND = '^packages/backend/'
const MODULES = '^packages/backend/src/modules/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'cliente-no-importa-backend',
      comment:
        'DES-11: solo el desplegable de la API importa packages/backend; las apps cliente hablan con la API por HTTP.',
      severity: 'error',
      from: { path: '^apps/(customer|negocios|motorizados|admin)/' },
      to: { path: '(^packages/backend/|^@tindivo/backend(/|$))' },
    },
    {
      name: 'backend-sin-next',
      comment: 'DES-9: el servicio no depende del framework.',
      severity: 'error',
      from: { path: BACKEND },
      to: { path: '(^next(/|$)|node_modules/next/)' },
    },
    {
      name: 'dominio-no-importa-infra',
      comment: 'TS-14: domain/ son reglas puras; infra/ queda fuera.',
      severity: 'error',
      from: { path: `${MODULES}[^/]+/domain/` },
      to: { path: '/infra/' },
    },
    {
      name: 'dominio-sin-sdk-de-proveedor',
      comment: 'DES-2, TS-4: el SDK de Supabase solo se importa en infra/.',
      severity: 'error',
      from: { path: `${MODULES}[^/]+/domain/` },
      to: { path: '(^@supabase/|node_modules/@supabase/)' },
    },
    {
      name: 'dominio-sin-modulos-de-node',
      comment: 'TS-4: domain/ no toca el sistema (fs, net, crypto…); recibe lo que necesita.',
      severity: 'error',
      from: { path: `${MODULES}[^/]+/domain/` },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'modulo-solo-importa-el-index-de-otro',
      comment: 'DES-4: un módulo solo importa el index.ts de otro módulo.',
      severity: 'error',
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: `${MODULES}[^/]+/`,
        pathNot: [`${MODULES}$1/`, `${MODULES}[^/]+/index[.]ts$`],
      },
    },
    {
      name: 'fuera-de-modulos-solo-el-index',
      comment: 'DES-4: http/, composition/ y shared/ tampoco entran a las tripas de un módulo.',
      severity: 'error',
      from: { path: BACKEND, pathNot: `${MODULES}` },
      to: { path: `${MODULES}[^/]+/`, pathNot: `${MODULES}[^/]+/index[.]ts$` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(\\.next|\\.turbo|coverage)(/|$)' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
