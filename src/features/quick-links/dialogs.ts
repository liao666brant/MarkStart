import type { QuickLink } from './storage'

type EditHandlers = {
  readonly faviconURL: (url: string) => string
  readonly updateFixedShortcut: (site: QuickLink, oldUrl: string) => void
}

type DeleteHandlers = {
  readonly addToBlacklist: (domain: string) => Promise<boolean>
  readonly removeFixedShortcut: (url: string) => void
  readonly generateQuickLinks: () => void
  readonly showToast: (message: string) => void
}

let quickLinkToDelete: QuickLink | null = null

export function showQuickLinkEditDialog(site: QuickLink, handlers: EditHandlers): void {
  const editDialog = document.getElementById('edit-dialog')
  const editNameInput = document.getElementById('edit-name')
  const editUrlInput = document.getElementById('edit-url')
  const editForm = document.getElementById('edit-form')
  const cancelButton = document.querySelector<HTMLButtonElement>('.cancel-button')
  const closeButton = document.querySelector<HTMLButtonElement>('.close-button')
  if (
    !editDialog ||
    !(editNameInput instanceof HTMLInputElement) ||
    !(editUrlInput instanceof HTMLInputElement) ||
    !(editForm instanceof HTMLFormElement) ||
    !cancelButton ||
    !closeButton
  ) return

  const title = editDialog.querySelector('h2')
  if (!title) return

  title.textContent = chrome.i18n.getMessage('editDialogTitle')
  editNameInput.value = site.name
  editUrlInput.value = site.url
  editDialog.style.display = 'block'

  editForm.onsubmit = (event) => {
    event.preventDefault()
    const name = editNameInput.value.trim()
    const url = editUrlInput.value.trim()
    if (!name || !url) return

    handlers.updateFixedShortcut({
      name,
      url,
      favicon: handlers.faviconURL(url),
      fixed: true,
    }, site.url)
    editDialog.style.display = 'none'
  }

  cancelButton.onclick = () => { editDialog.style.display = 'none' }
  closeButton.onclick = () => { editDialog.style.display = 'none' }
}

export function showQuickLinkDeleteDialog(site: QuickLink, handlers: DeleteHandlers): void {
  console.log('=== Quick Link Delete Confirmation ===')
  console.log('Quick link to delete:', site)

  const dialog = document.getElementById('confirm-dialog')
  const message = document.getElementById('confirm-dialog-message')
  const quickLinkMessage = document.getElementById('confirm-delete-quick-link-message')
  const confirmButton = document.querySelector<HTMLButtonElement>('#confirm-delete-button')
  const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-delete-button')
  if (!dialog || !confirmButton || !cancelButton) return

  quickLinkToDelete = site
  if (message) message.style.display = 'none'
  if (quickLinkMessage) {
    quickLinkMessage.style.display = 'block'
    quickLinkMessage.innerHTML = chrome.i18n.getMessage('confirmDeleteQuickLinkMessage', `<strong>${site.name}</strong>`)
  } else {
    console.error('Quick link delete message element not found')
  }
  dialog.style.display = 'block'

  confirmButton.onclick = () => {
    const selectedLink = quickLinkToDelete
    if (!selectedLink) {
      console.error('No quick link selected for deletion')
      return
    }

    const domain = new URL(selectedLink.url).hostname
    handlers.addToBlacklist(domain).then((added) => {
      if (added) {
        if (selectedLink.fixed) handlers.removeFixedShortcut(selectedLink.url)
        handlers.generateQuickLinks()
        handlers.showToast(chrome.i18n.getMessage('deleteSuccess'))
      }
      dialog.style.display = 'none'
      if (message) message.style.display = 'block'
      if (quickLinkMessage) quickLinkMessage.style.display = 'none'
      quickLinkToDelete = null
    })
  }

  cancelButton.onclick = () => {
    dialog.style.display = 'none'
    if (message) message.style.display = 'block'
    if (quickLinkMessage) quickLinkMessage.style.display = 'none'
    quickLinkToDelete = null
  }
}
