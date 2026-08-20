export function initializeYearProgress(): void {
  const yearProgressContainer = document.getElementById('year-progress')
  if (!yearProgressContainer) {
    return
  }

  const currentYear = new Date().getFullYear()
  const startOfYear = new Date(currentYear, 0, 1)
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59)
  const yearProgress =
    ((Date.now() - startOfYear.getTime()) / (endOfYear.getTime() - startOfYear.getTime())) * 100

  const progressBar = document.createElement('div')
  progressBar.className = 'progress-bar'
  for (let index = 0; index < 12; index += 1) {
    const progressSegment = document.createElement('div')
    if (index < Math.floor(yearProgress / 8.33)) {
      progressSegment.classList.add('active')
    }
    progressBar.appendChild(progressSegment)
  }

  const yearProgressElement = document.createElement('div')
  yearProgressElement.className = 'year-progress'
  yearProgressElement.innerHTML = `<span>${currentYear} ${chrome.i18n.getMessage('yearProgress')}</span>`
  yearProgressElement.appendChild(progressBar)

  const progressPercentage = document.createElement('div')
  progressPercentage.className = 'progress-percentage'
  progressPercentage.textContent = `${yearProgress.toFixed(2)}%`
  yearProgressContainer.append(yearProgressElement, progressPercentage)

  const updateColors = (): void => {
    if (typeof window.adjustTextColor !== 'function') {
      return
    }

    const yearTextSpan = yearProgressElement.querySelector<HTMLElement>('span')
    const backgroundImage = document.body.style.backgroundImage
    if (!yearTextSpan || !backgroundImage) {
      return
    }

    const activeSegments = progressBar.querySelectorAll<HTMLElement>('.active')
    const inactiveSegments = progressBar.querySelectorAll<HTMLElement>('div:not(.active)')
    const image = new Image()
    image.crossOrigin = 'Anonymous'
    image.src = backgroundImage.slice(5, -2)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }

      const sampleSize = 50
      canvas.width = sampleSize
      canvas.height = sampleSize
      context.drawImage(image, 0, 0, sampleSize, sampleSize)

      try {
        const data = context.getImageData(0, 0, sampleSize, sampleSize).data
        let red = 0
        let green = 0
        let blue = 0
        let count = 0
        for (let index = 0; index < data.length; index += 4) {
          const sampleRed = data.at(index)
          const sampleGreen = data.at(index + 1)
          const sampleBlue = data.at(index + 2)
          if (sampleRed === undefined || sampleGreen === undefined || sampleBlue === undefined) {
            continue
          }
          red += sampleRed
          green += sampleGreen
          blue += sampleBlue
          count += 1
        }
        if (count === 0) {
          return
        }

        red = Math.floor(red / count)
        green = Math.floor(green / count)
        blue = Math.floor(blue / count)
        const brightness = red * 0.299 + green * 0.587 + blue * 0.114
        yearTextSpan.style.color =
          brightness > 128
            ? `rgba(${Math.max(0, red - 160)}, ${Math.max(0, green - 160)}, ${Math.max(0, blue - 160)}, 0.75)`
            : `rgba(${Math.min(255, 255 - red + 80)}, ${Math.min(255, 255 - green + 80)}, ${Math.min(255, 255 - blue + 80)}, 0.75)`
        yearTextSpan.style.textShadow = 'none'
        yearTextSpan.style.transition = 'color 0.3s ease'
        progressPercentage.style.color = yearTextSpan.style.color
        progressPercentage.style.textShadow = 'none'
        progressPercentage.style.transition = 'color 0.3s ease'

        activeSegments.forEach((segment) => {
          segment.style.backgroundColor =
            brightness > 128
              ? `rgba(${Math.max(0, red - 160)}, ${Math.max(0, green - 160)}, ${Math.max(0, blue - 160)}, 0.3)`
              : `rgba(${Math.min(255, 255 - red + 80)}, ${Math.min(255, 255 - green + 80)}, ${Math.min(255, 255 - blue + 80)}, 0.3)`
          segment.style.boxShadow = 'none'
          segment.style.transition = 'background-color 0.3s ease'
        })
        inactiveSegments.forEach((segment) => {
          segment.style.backgroundColor =
            brightness > 128 ? `rgba(${red}, ${green}, ${blue}, 0.1)` : 'rgba(255, 255, 255, 0.1)'
          segment.style.boxShadow = 'none'
          segment.style.transition = 'background-color 0.3s ease'
        })
      } catch (error) {
        if (!(error instanceof DOMException)) {
          throw error
        }
        console.error('分析背景颜色失败:', error)
      }
    }
  }

  updateColors()
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'style' &&
        mutation.target === document.body
      ) {
        updateColors()
      }
    })
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'] })
}

document.addEventListener('DOMContentLoaded', initializeYearProgress)
