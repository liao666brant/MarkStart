export function applySavedBackgroundColor(): void {
  const savedBackground = localStorage.getItem('selectedBackground')
  if (!savedBackground) return

  if (localStorage.getItem('useDefaultBackground') !== 'true') {
    document.querySelectorAll<HTMLElement>('.settings-bg-option').forEach((option) => {
      option.classList.remove('active')
    })
    return
  }

  document.documentElement.className = savedBackground
  const welcomeElement = document.getElementById('welcome-message')
  if (welcomeElement && window.WelcomeManager) {
    window.WelcomeManager.adjustTextColor(welcomeElement)
  }
}
