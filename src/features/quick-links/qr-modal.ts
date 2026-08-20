import QRCode from 'qrcode'

export function createQuickLinkQrCode(url: string, bookmarkName: string): void {
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

  const qrContainer = document.createElement('div')
  qrContainer.style.backgroundColor = 'white'
  qrContainer.style.padding = '1.5rem 3rem'
  qrContainer.style.width = '320px'
  qrContainer.style.borderRadius = '10px'
  qrContainer.style.display = 'flex'
  qrContainer.style.flexDirection = 'column'
  qrContainer.style.alignItems = 'center'
  qrContainer.style.position = 'relative'

  const closeButton = document.createElement('span')
  closeButton.textContent = '×'
  closeButton.style.position = 'absolute'
  closeButton.style.right = '10px'
  closeButton.style.top = '10px'
  closeButton.style.fontSize = '20px'
  closeButton.style.cursor = 'pointer'
  closeButton.onclick = () => document.body.removeChild(modal)
  qrContainer.appendChild(closeButton)

  const title = document.createElement('h2')
  title.textContent = window.getLocalizedMessage('scanQRCode')
  title.style.marginBottom = '20px'
  title.style.fontWeight = '600'
  title.style.fontSize = '0.875rem'
  qrContainer.appendChild(title)

  const qrCodeElement = document.createElement('canvas')
  qrContainer.appendChild(qrCodeElement)

  const urlDisplay = document.createElement('div')
  urlDisplay.textContent = url
  urlDisplay.style.marginTop = '20px'
  urlDisplay.style.wordBreak = 'break-all'
  urlDisplay.style.maxWidth = '300px'
  urlDisplay.style.textAlign = 'center'
  qrContainer.appendChild(urlDisplay)

  const buttonContainer = document.createElement('div')
  buttonContainer.style.display = 'flex'
  buttonContainer.style.justifyContent = 'space-between'
  buttonContainer.style.width = '100%'
  buttonContainer.style.marginTop = '20px'

  const copyButton = document.createElement('button')
  copyButton.textContent = window.getLocalizedMessage('copyLink')
  copyButton.onclick = () => {
    navigator.clipboard.writeText(url).then(() => {
      copyButton.textContent = window.getLocalizedMessage('copied')
      setTimeout(() => copyButton.textContent = window.getLocalizedMessage('copyLink'), 2000)
    })
  }

  const downloadButton = document.createElement('button')
  downloadButton.textContent = window.getLocalizedMessage('download')
  downloadButton.onclick = () => {
    setTimeout(() => {
      const link = document.createElement('a')
      link.download = `${bookmarkName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcode.png`
      link.href = qrCodeElement.toDataURL('image/png')
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

  buttonContainer.append(copyButton, downloadButton)
  qrContainer.appendChild(buttonContainer)
  modal.appendChild(qrContainer)
  document.body.appendChild(modal)

  void QRCode.toCanvas(qrCodeElement, url, { width: 200 }).catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Failed to create QR code:', error)
      return
    }
    throw error
  })

  modal.addEventListener('click', (event) => {
    if (event.target === modal) document.body.removeChild(modal)
  })
}
