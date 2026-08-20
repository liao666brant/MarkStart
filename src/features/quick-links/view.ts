import type { QuickLink } from './storage'

type ContextMenuHandler = (event: MouseEvent, site: QuickLink) => void

export function renderQuickLinks(
  shortcuts: readonly QuickLink[],
  showContextMenu: ContextMenuHandler,
): void {
  const quickLinksContainer = document.getElementById('quick-links')
  if (!quickLinksContainer) return

  const fragment = document.createDocumentFragment()
  quickLinksContainer.innerHTML = ''

  shortcuts.forEach((site) => {
    const linkItem = document.createElement('div')
    linkItem.className = 'quick-link-item-container'
    linkItem.dataset['url'] = site.url

    const link = document.createElement('a')
    link.href = site.url
    link.className = 'quick-link-item'
    link.addEventListener('click', (event) => {
      event.preventDefault()

      try {
        console.log('[Quick Link Click] Starting...', { url: site.url, currentUrl: window.location.href })
        chrome.storage.sync.get(['openInNewTab'], (result) => {
          if (result['openInNewTab'] !== false) {
            window.open(site.url, '_blank')
          } else {
            window.location.href = site.url
          }
        })
      } catch (error) {
        if (error instanceof Error) {
          console.error('[Quick Link Click] Error:', error)
          return
        }
        throw error
      }
    })

    const image = document.createElement('img')
    image.src = site.favicon
    image.alt = `${site.name} Favicon`
    image.loading = 'lazy'
    image.addEventListener('error', function () {
      this.src = '../images/placeholder-icon.svg'
    })
    link.appendChild(image)

    const name = document.createElement('span')
    name.textContent = site.name
    linkItem.append(link, name)
    linkItem.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      showContextMenu(event, site)
    })
    fragment.appendChild(linkItem)
  })

  const placeholdersNeeded = Math.min(0, 10 - shortcuts.length)
  if (shortcuts.length < 10) {
    for (let index = 0; index < placeholdersNeeded; index += 1) {
      const placeholder = document.createElement('div')
      placeholder.className = 'quick-link-placeholder'
      if (index === 0 && shortcuts.length === 0) {
        const hint = document.createElement('span')
        hint.className = 'placeholder-hint'
        hint.textContent = '访问网站将自动添加到这里'
        placeholder.appendChild(hint)
      }
      fragment.appendChild(placeholder)
    }
  }

  quickLinksContainer.appendChild(fragment)
}
