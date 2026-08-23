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
  const yearProgressLabel = document.createElement('span')
  yearProgressLabel.textContent = `${currentYear} ${chrome.i18n.getMessage('yearProgress')}`
  yearProgressElement.append(yearProgressLabel, progressBar)

  const progressPercentage = document.createElement('div')
  progressPercentage.className = 'progress-percentage'
  progressPercentage.textContent = `${yearProgress.toFixed(2)}%`
  yearProgressContainer.append(yearProgressElement, progressPercentage)
}

document.addEventListener('DOMContentLoaded', initializeYearProgress)
