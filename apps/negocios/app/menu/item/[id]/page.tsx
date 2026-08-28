'use client'

import { LoadingState } from '@tindivo/ui'
import { useState } from 'react'
import { DesktopView } from '@/features/menu/item-edit/components/desktop-view'
import { MobileView } from '@/features/menu/item-edit/components/mobile-view'
import { useItemEditor } from '@/features/menu/item-edit/hooks/use-item-editor'

export default function MenuItemEditorPage() {
  const editor = useItemEditor()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)

  if (!editor.ready) {
    return (
      <LoadingState
        variant="fullscreen"
        label="Cargando información del plato…"
        description="Menú Tindivo"
        icon="fastfood"
      />
    )
  }

  const title = editor.isNew ? 'Nuevo plato' : `Editar · ${editor.formData.name || 'plato'}`
  const categoryName =
    editor.cats.find((c) => c.id === editor.formData.category_id)?.name ?? 'Sin categoría'
  const imageSrc = editor.imagePreview ?? editor.formData.image_url

  function handleBack() {
    if (editor.hasUnsaved) {
      setShowUnsavedModal(true)
    } else {
      editor.handleBack()
    }
  }

  async function handleConfirmDelete() {
    setShowDeleteModal(false)
    await editor.handleDeleteItem()
  }

  async function handleSaveAndExit() {
    const ok = await editor.handleSave()
    if (ok) editor.handleSaveAndExit()
    else setShowUnsavedModal(false)
  }

  return (
    <>
      <MobileView
        isNew={editor.isNew}
        titleName={editor.formData.name}
        hasUnsaved={editor.hasUnsaved}
        saving={editor.saving}
        saveError={editor.saveError}
        showDeleteModal={showDeleteModal}
        showUnsavedModal={showUnsavedModal}
        showPreviewMobile={showPreviewMobile}
        onShowDeleteModal={setShowDeleteModal}
        onShowUnsavedModal={setShowUnsavedModal}
        onShowPreviewMobile={setShowPreviewMobile}
        onSave={editor.handleSave}
        onBack={handleBack}
        onSaveAndExit={handleSaveAndExit}
        onDiscard={editor.handleDiscard}
        formData={editor.formData}
        cats={editor.cats}
        groups={editor.groups}
        libraryGroups={editor.libraryGroups}
        imageSrc={imageSrc}
        imageError={editor.imageError}
        imageBusy={editor.imageBusy}
        onFormChange={editor.patchForm}
        onGroupChange={editor.patchGroup}
        onGroupPriceDisplayChange={editor.setGroupPriceDisplay}
        onGroupToggleExpand={editor.toggleGroupExpand}
        onGroupDelete={editor.deleteGroup}
        onGroupAddOption={editor.addOptionToGroup}
        onGroupDeleteOption={editor.deleteOption}
        onGroupChangeOption={editor.changeOption}
        onGroupMoveOption={editor.moveOption}
        onGroupMoveUp={editor.moveGroupUp}
        onGroupMoveDown={editor.moveGroupDown}
        onAddGroup={editor.addGroup}
        onLinkLibraryGroup={editor.linkLibraryGroup}
        onDeleteItem={() => setShowDeleteModal(true)}
        onConfirmDelete={handleConfirmDelete}
        onPickImage={editor.onPickImage}
        onClearImage={editor.onClearImage}
      />
      <DesktopView
        title={title}
        isNew={editor.isNew}
        hasUnsaved={editor.hasUnsaved}
        saving={editor.saving}
        saveError={editor.saveError}
        showDeleteModal={showDeleteModal}
        showUnsavedModal={showUnsavedModal}
        categoryName={categoryName}
        bizName={editor.bizName}
        accent={editor.accent}
        pendingOrders={editor.pendingOrders}
        onShowDeleteModal={setShowDeleteModal}
        onShowUnsavedModal={setShowUnsavedModal}
        onSave={editor.handleSave}
        onBack={handleBack}
        onSaveAndExit={handleSaveAndExit}
        onDiscard={editor.handleDiscard}
        onSignOut={editor.signOut}
        formData={editor.formData}
        cats={editor.cats}
        groups={editor.groups}
        libraryGroups={editor.libraryGroups}
        imageSrc={imageSrc}
        imageError={editor.imageError}
        imageBusy={editor.imageBusy}
        onFormChange={editor.patchForm}
        onGroupChange={editor.patchGroup}
        onGroupPriceDisplayChange={editor.setGroupPriceDisplay}
        onGroupToggleExpand={editor.toggleGroupExpand}
        onGroupDelete={editor.deleteGroup}
        onGroupAddOption={editor.addOptionToGroup}
        onGroupDeleteOption={editor.deleteOption}
        onGroupChangeOption={editor.changeOption}
        onGroupMoveOption={editor.moveOption}
        onGroupMoveUp={editor.moveGroupUp}
        onGroupMoveDown={editor.moveGroupDown}
        onAddGroup={editor.addGroup}
        onLinkLibraryGroup={editor.linkLibraryGroup}
        onDeleteItem={() => setShowDeleteModal(true)}
        onConfirmDelete={handleConfirmDelete}
        onPickImage={editor.onPickImage}
        onClearImage={editor.onClearImage}
      />
    </>
  )
}
