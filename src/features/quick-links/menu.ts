import { ICONS } from '../../shared/icons'
import type { IconName } from '../../shared/icons'
import { createQuickLinkQrCode } from './qr-modal'
import type { QuickLink } from './storage'

type ContextMenuItem = {
  readonly text: string
  readonly icon: IconName
  readonly action: () => unknown
}

type QuickLinkMenuHandlers = {
  readonly editQuickLink: (site: QuickLink) => void
  readonly addToBlacklistConfirm: (site: QuickLink) => void
  readonly copyToClipboard: (url: string) => void
}

export function showQuickLinkContextMenu(
  event: MouseEvent,
  site: QuickLink,
  handlers: QuickLinkMenuHandlers,
): void {
  console.log('=== Quick Link Context Menu ===')
  console.log('Event:', event.type)
  console.log('Site:', site)

  event.preventDefault()
  const existingMenu = document.querySelector('.custom-context-menu')
  if (existingMenu) {
    console.log('Removing existing context menu')
    existingMenu.remove()
  }

  const contextMenu = document.createElement('div')
  contextMenu.className = 'custom-context-menu'
  contextMenu.style.display = 'block'
  contextMenu.style.left = `${event.clientX}px`
  contextMenu.style.top = `${event.clientY}px`

  const menuItems: readonly ContextMenuItem[] = [
    { text: chrome.i18n.getMessage('openInNewTab'), icon: 'open_in_new', action: () => window.open(site.url, '_blank') },
    { text: chrome.i18n.getMessage('openInNewWindow'), icon: 'launch', action: () => window.open(site.url, '_blank', 'noopener,noreferrer') },
    { text: chrome.i18n.getMessage('openInIncognito'), icon: 'visibility_off', action: () => chrome.windows.create({ url: site.url, incognito: true }) },
    { text: chrome.i18n.getMessage('editQuickLink'), icon: 'edit', action: () => handlers.editQuickLink(site) },
    { text: chrome.i18n.getMessage('deleteQuickLink'), icon: 'delete', action: () => handlers.addToBlacklistConfirm(site) },
    { text: chrome.i18n.getMessage('copyLink'), icon: 'content_copy', action: () => handlers.copyToClipboard(site.url) },
    { text: chrome.i18n.getMessage('createQRCode'), icon: 'qr_code', action: () => createQuickLinkQrCode(site.url, site.name) },
  ]

  menuItems.forEach((item, index) => {
    const menuItem = document.createElement('div')
    menuItem.className = 'custom-context-menu-item'

    const icon = document.createElement('span')
    icon.className = 'material-icons'
    icon.innerHTML = ICONS[item.icon]

    const text = document.createElement('span')
    text.textContent = item.text

    menuItem.append(icon, text)
    menuItem.addEventListener('click', () => {
      item.action()
      contextMenu.remove()
    })

    if (index === 3 || index === 5) {
      const divider = document.createElement('div')
      divider.className = 'custom-context-menu-divider'
      contextMenu.appendChild(divider)
    }

    contextMenu.appendChild(menuItem)
  })

  document.body.appendChild(contextMenu)

  const menuRect = contextMenu.getBoundingClientRect()
  if (event.clientX + menuRect.width > window.innerWidth) {
    contextMenu.style.left = `${window.innerWidth - menuRect.width}px`
  }
  if (event.clientY + menuRect.height > window.innerHeight) {
    contextMenu.style.top = `${window.innerHeight - menuRect.height}px`
  }

  function closeMenu(clickEvent: MouseEvent): void {
    if (!(clickEvent.target instanceof Node) || !contextMenu.contains(clickEvent.target)) {
      contextMenu.remove()
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}
