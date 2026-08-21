export function getLocalizedMessage(messageName: string): string {
  const message = chrome.i18n.getMessage(messageName)
  return message || messageName
}

function getPresentMessage(messageName: string): string | null {
  const message = chrome.i18n.getMessage(messageName)
  return message === '' ? null : message
}

export function updateUILanguage(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const messageName = element.getAttribute('data-i18n')
    if (messageName === null) {
      return
    }
    const message = getPresentMessage(messageName)
    if (message !== null) {
      element.textContent = message
    }
  })

  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]')
    .forEach((element) => {
      const messageName = element.getAttribute('data-i18n-placeholder')
      if (messageName === null) {
        return
      }
      const message = getPresentMessage(messageName)
      if (message !== null) {
        element.placeholder = message
      }
    })

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const messageName = element.getAttribute('data-i18n-title')
    if (messageName === null) {
      return
    }
    const message = getPresentMessage(messageName)
    if (message !== null) {
      element.title = message
    }
  })
}

window.getLocalizedMessage = getLocalizedMessage
window.updateUILanguage = updateUILanguage

document.addEventListener('DOMContentLoaded', updateUILanguage)
