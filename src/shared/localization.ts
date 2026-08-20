export function getLocalizedMessage(messageName: string): string {
  const message = chrome.i18n.getMessage(messageName)
  return message || messageName
}

export function updateUILanguage(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const messageName = element.getAttribute('data-i18n')
    if (messageName !== null) {
      element.textContent = getLocalizedMessage(messageName)
    }
  })

  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]')
    .forEach((element) => {
      const messageName = element.getAttribute('data-i18n-placeholder')
      if (messageName !== null) {
        element.placeholder = getLocalizedMessage(messageName)
      }
    })

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const messageName = element.getAttribute('data-i18n-title')
    if (messageName !== null) {
      element.title = getLocalizedMessage(messageName)
    }
  })
}

window.getLocalizedMessage = getLocalizedMessage
window.updateUILanguage = updateUILanguage

document.addEventListener('DOMContentLoaded', updateUILanguage)
