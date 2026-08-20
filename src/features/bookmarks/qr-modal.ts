import QRCode from 'qrcode'

import type { GetLocalizedMessage } from '../../shared/types'

export function createBookmarkQrCode(
  url: string,
  bookmarkName: string,
  getLocalizedMessage: GetLocalizedMessage,
): void {
  const modal = document.createElement('div')
  modal.style.position = 'fixed'
  modal.style.left = '0'
  modal.style.top = '0'
  modal.style.width = '100%'
  modal.style.height = '100%'
  modal.style.backgroundColor = 'rgba(0,0,0,0.5)'
  modal.style.display = 'flex'
  modal.style.justifyContent = 'center'
  modal.style.alignItems = 'center'
  modal.style.zIndex = '1000'

  const container = document.createElement('div')
  container.style.backgroundColor = 'white'
  container.style.padding = '1.5rem 3rem'
  container.style.width = '320px'
  container.style.borderRadius = '10px'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.alignItems = 'center'
  container.style.position = 'relative'

  const closeButton = document.createElement('span')
  closeButton.textContent = '×'
  closeButton.style.position = 'absolute'
  closeButton.style.right = '10px'
  closeButton.style.top = '10px'
  closeButton.style.fontSize = '20px'
  closeButton.style.cursor = 'pointer'
  closeButton.onclick = () => document.body.removeChild(modal)
  container.appendChild(closeButton)

  const title = document.createElement('h2')
  title.textContent = getLocalizedMessage('scanQRCode')
  title.style.marginBottom = '20px'
  title.style.fontWeight = '600'
  title.style.fontSize = '0.875rem'
  container.appendChild(title)

  const canvas = document.createElement('canvas')
  container.appendChild(canvas)

  const urlDisplay = document.createElement('div')
  urlDisplay.textContent = url
  urlDisplay.style.marginTop = '20px'
  urlDisplay.style.wordBreak = 'break-all'
  urlDisplay.style.maxWidth = '300px'
  urlDisplay.style.textAlign = 'center'
  container.appendChild(urlDisplay)

  const buttons = document.createElement('div')
  buttons.style.display = 'flex'
  buttons.style.justifyContent = 'space-between'
  buttons.style.width = '100%'
  buttons.style.marginTop = '20px'

  const copyButton = document.createElement('button')
  copyButton.textContent = getLocalizedMessage('copyLink')
  copyButton.onclick = () => {
    navigator.clipboard.writeText(url).then(() => {
      copyButton.textContent = getLocalizedMessage('copied')
      setTimeout(() => {
        copyButton.textContent = getLocalizedMessage('copyLink')
      }, 2000)
    })
  }

  const downloadButton = document.createElement('button')
  downloadButton.textContent = getLocalizedMessage('download')
  downloadButton.onclick = () => {
    setTimeout(() => {
      const link = document.createElement('a')
      link.download = `${bookmarkName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcode.png`
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }, 100)
  }

  for (const button of [copyButton, downloadButton]) {
    button.style.padding = '5px 10px'
    button.style.border = 'none'
    button.style.borderRadius = '5px'
    button.style.cursor = 'pointer'
    button.style.backgroundColor = '#f0f0f0'
    button.style.color = '#333'
    button.style.transition = 'all 0.3s ease'
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#e0e0e0'
      button.style.color = '#111827'
    })
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#f0f0f0'
      button.style.color = '#717882'
    })
  }

  buttons.append(copyButton, downloadButton)
  container.appendChild(buttons)
  modal.appendChild(container)
  document.body.appendChild(modal)

  void QRCode.toCanvas(canvas, url, { width: 200 }).catch((error: unknown) => {
    console.error('Failed to create QR code:', error)
  })

  modal.addEventListener('click', (event) => {
    if (event.target === modal) document.body.removeChild(modal)
  })
}
