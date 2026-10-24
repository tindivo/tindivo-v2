import { describe, expect, it } from 'vitest'
import {
  checkModifierSelection,
  type ModifierSelectionGroup,
  modifierSelectionMessage,
} from '../modifier-selection'

const group: ModifierSelectionGroup = {
  id: 'size',
  name: 'Tamaño',
  selection_type: 'single',
  is_required: true,
  min_selections: 0,
  max_selections: null,
}
const optionGroupOf = new Map([
  ['small', 'size'],
  ['large', 'size'],
  ['extra', 'size'],
  ['sauce', 'sauces'],
])
const check = (ids: string[], patch: Partial<ModifierSelectionGroup> = {}) =>
  checkModifierSelection([{ ...group, ...patch }], ids, optionGroupOf)

describe('las opciones elegidas respetan las reglas del grupo', () => {
  it('single obligatorio exige una opción e ignora los límites de multi', () => {
    expect(check([])).toMatchObject([{ kind: 'missing', groupId: 'size', min: 1 }])
    expect(check(['small'], { min_selections: 3, max_selections: 0 })).toEqual([])
    expect(check(['small', 'large'])).toMatchObject([{ kind: 'too_many', max: 1 }])
  })

  it('single opcional admite cero o una, pero nunca dos', () => {
    expect(check([], { is_required: false })).toEqual([])
    expect(check(['small'], { is_required: false })).toEqual([])
    expect(check(['small', 'large'], { is_required: false })).toMatchObject([
      { kind: 'too_many', max: 1 },
    ])
  })

  it.each(['multi', 'future_type'])('%s obligatorio exige al menos uno y respeta min', (type) => {
    expect(check([], { selection_type: type })).toMatchObject([{ kind: 'missing', min: 1 }])
    expect(check(['small'], { selection_type: type })).toEqual([])
    expect(check(['small'], { selection_type: type, min_selections: 2 })).toMatchObject([
      { kind: 'missing', min: 2 },
    ])
    expect(check(['small', 'large'], { selection_type: type, min_selections: 2 })).toEqual([])
  })

  it.each(['multi', 'future_type'])('%s admite n = max y rechaza n = max + 1', (type) => {
    const patch = { selection_type: type, max_selections: 2 }
    expect(check(['small', 'large'], patch)).toEqual([])
    expect(check(['small', 'large', 'extra'], patch)).toMatchObject([{ kind: 'too_many', max: 2 }])
    expect(check(['small', 'large', 'extra'], { selection_type: type })).toEqual([])
  })

  it('multi opcional ignora min, pero aplica max incluso si es cero', () => {
    const patch = { selection_type: 'multi', is_required: false, min_selections: 3 }
    expect(check([], patch)).toEqual([])
    expect(check(['small'], patch)).toEqual([])
    expect(check([], { ...patch, max_selections: 0 })).toEqual([])
    expect(check(['small'], { ...patch, max_selections: 0 })).toMatchObject([
      { kind: 'too_many', max: 0 },
    ])
  })

  it('cuenta cada grupo por separado e incluye los obligatorios sin selección', () => {
    const groups = [group, { ...group, id: 'sauces', name: 'Salsas' }]
    expect(checkModifierSelection(groups, ['small'], optionGroupOf)).toMatchObject([
      { kind: 'missing', groupId: 'sauces', groupName: 'Salsas' },
    ])
    expect(checkModifierSelection(groups, ['small', 'sauce'], optionGroupOf)).toEqual([])
  })

  it('informa primero las repetidas aunque el grupo admita varias opciones', () => {
    expect(check(['small', 'small'], { selection_type: 'multi' })).toMatchObject([
      { kind: 'duplicate', groupId: 'size', groupName: 'Tamaño', optionId: 'small' },
    ])
    expect(check(['small', 'small'])[0]?.kind).toBe('duplicate')
  })

  it('detecta el mismo UUID en minúsculas y mayúsculas como una opción repetida', () => {
    const optionId = 'abcdefab-1234-4000-8000-abcdef123456'
    const issues = checkModifierSelection(
      [group],
      [optionId, optionId.toUpperCase()],
      new Map([[optionId, group.id]]),
    )
    expect(issues[0]).toEqual({
      kind: 'duplicate',
      groupId: group.id,
      groupName: group.name,
      optionId,
    })
  })

  it('acepta un UUID de opción en mayúsculas con el mapa en minúsculas', () => {
    const optionId = 'abcdefab-1234-4000-8000-abcdef123456'
    expect(
      checkModifierSelection([group], [optionId.toUpperCase()], new Map([[optionId, group.id]])),
    ).toEqual([])
  })

  it('compara también las claves del mapa y los UUID de grupo sin distinguir mayúsculas', () => {
    const optionId = 'abcdefab-1234-4000-8000-abcdef123456'
    const groupId = 'fedcbafe-1234-4000-8000-fedcba654321'
    expect(
      checkModifierSelection(
        [{ ...group, id: groupId.toUpperCase() }],
        [optionId],
        new Map([[optionId.toUpperCase(), groupId]]),
      ),
    ).toEqual([])
    expect(
      checkModifierSelection(
        [{ ...group, id: groupId }],
        [optionId],
        new Map([[optionId, groupId.toUpperCase()]]),
      ),
    ).toEqual([])
  })

  it('un plato sin grupos admite una selección vacía y detecta ids repetidos', () => {
    expect(checkModifierSelection([], [], new Map())).toEqual([])
    expect(checkModifierSelection([], ['x', 'x'], new Map())).toMatchObject([
      { kind: 'duplicate', groupId: null, groupName: null, optionId: 'x' },
    ])
  })
})

describe('los mensajes indican qué corregir en el plato', () => {
  it.each([
    { ids: [], patch: {}, message: 'Elige una opción de «Tamaño» en «Pizza».' },
    {
      ids: [],
      patch: { selection_type: 'multi' },
      message: 'Elige al menos 1 opción de «Tamaño» en «Pizza».',
    },
    {
      ids: ['small'],
      patch: { selection_type: 'multi', min_selections: 2 },
      message: 'Elige al menos 2 opciones de «Tamaño» en «Pizza».',
    },
    {
      ids: ['small', 'large'],
      patch: {},
      message: 'En «Tamaño» de «Pizza» solo puedes elegir una opción.',
    },
    {
      ids: ['small', 'large'],
      patch: { selection_type: 'multi', max_selections: 1 },
      message: 'En «Tamaño» de «Pizza» puedes elegir hasta 1 opción.',
    },
    {
      ids: ['small', 'large', 'extra'],
      patch: { selection_type: 'multi', max_selections: 2 },
      message: 'En «Tamaño» de «Pizza» puedes elegir hasta 2 opciones.',
    },
    {
      ids: ['small', 'small'],
      patch: {},
      message: 'Hay una opción repetida en «Pizza».',
    },
  ])('$message', ({ ids, patch, message }) => {
    const issue = check(ids, patch)[0]
    expect(issue).toBeDefined()
    if (issue) expect(modifierSelectionMessage(issue, 'Pizza')).toBe(message)
  })
})
