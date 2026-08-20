export function showQuickLinkToast(message: string): void {
  const toast = document.getElementById('toast')
  if (!toast) return

  toast.textContent = message
  toast.style.display = 'block'
  setTimeout(() => { toast.style.display = 'none' }, 3000)
}

export function copyQuickLinkToClipboard(url: string): void {
  try {
    navigator.clipboard.writeText(url).then(() => {
      showQuickLinkToast(chrome.i18n.getMessage('linkCopied'))
    }).catch(() => {
      showQuickLinkToast(chrome.i18n.getMessage('copyLinkFailed'))
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    console.error('Copy failed:', error)
    showQuickLinkToast(chrome.i18n.getMessage('copyLinkFailed'))
  }
}
