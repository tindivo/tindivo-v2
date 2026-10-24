export interface ModifierSelectionGroup {
  id: string
  name: string
  selection_type: string
  is_required: boolean
  min_selections: number
  max_selections: number | null
}

type GroupIssue = {
  groupId: string
  groupName: string
  selectionType: 'single' | 'multi'
}

export type ModifierSelectionIssue =
  | (GroupIssue & { kind: 'missing'; min: number })
  | (GroupIssue & { kind: 'too_many'; max: number })
  | { kind: 'duplicate'; groupId: string | null; groupName: string | null; optionId: string }

/** La pertenencia y disponibilidad de las opciones se comprueban en el consumidor. */
export function checkModifierSelection(
  groups: readonly ModifierSelectionGroup[],
  selectedOptionIds: readonly string[],
  optionGroupOf: ReadonlyMap<string, string>,
): ModifierSelectionIssue[] {
  const issues: ModifierSelectionIssue[] = []
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const counts = new Map<string, number>()
  for (const optionId of selectedOptionIds) {
    const groupId = optionGroupOf.get(optionId) ?? null
    if (seen.has(optionId) && !duplicates.has(optionId)) {
      issues.push({
        kind: 'duplicate',
        groupId,
        groupName: groups.find((g) => g.id === groupId)?.name ?? null,
        optionId,
      })
      duplicates.add(optionId)
    }
    seen.add(optionId)
    if (groupId !== null) counts.set(groupId, (counts.get(groupId) ?? 0) + 1)
  }

  for (const group of groups) {
    const n = counts.get(group.id) ?? 0
    const isSingle = group.selection_type === 'single'
    const min = isSingle ? 1 : Math.max(1, group.min_selections)
    const max = isSingle ? 1 : group.max_selections
    const info: GroupIssue = {
      groupId: group.id,
      groupName: group.name,
      selectionType: isSingle ? 'single' : 'multi',
    }
    if (max !== null && n > max) issues.push({ ...info, kind: 'too_many', max })
    if (group.is_required && n < min) issues.push({ ...info, kind: 'missing', min })
  }
  return issues
}

export function modifierSelectionMessage(issue: ModifierSelectionIssue, dishName: string): string {
  if (issue.kind === 'duplicate') return `Hay una opción repetida en «${dishName}».`
  if (issue.kind === 'missing') {
    return issue.selectionType === 'single'
      ? `Elige una opción de «${issue.groupName}» en «${dishName}».`
      : `Elige al menos ${issue.min} ${issue.min === 1 ? 'opción' : 'opciones'} de «${issue.groupName}» en «${dishName}».`
  }
  return issue.selectionType === 'single'
    ? `En «${issue.groupName}» de «${dishName}» solo puedes elegir una opción.`
    : `En «${issue.groupName}» de «${dishName}» puedes elegir hasta ${issue.max} ${issue.max === 1 ? 'opción' : 'opciones'}.`
}
