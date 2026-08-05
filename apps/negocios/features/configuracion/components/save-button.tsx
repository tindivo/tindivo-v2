import { Button, Icon } from '@tindivo/ui'

interface SaveButtonProps {
  saving: boolean
  block?: boolean
}

export function SaveButton({ saving, block }: SaveButtonProps) {
  return (
    <Button
      type="submit"
      variant="brand"
      size={block ? 'lg' : 'md'}
      className={block ? 'w-full' : ''}
      disabled={saving}
    >
      <Icon name="save" size={block ? 20 : 18} filled />
      {saving ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  )
}
