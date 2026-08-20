export type GetLocalizedMessage = (messageName: string) => string

export type UpdateUILanguage = () => void

export type WelcomeManagerContract = {
  initialize(): void
  updateWelcomeMessage(checkVisibility?: boolean): void
  initializeColorCache(): void
  adjustTextColor(element: HTMLElement): void
  setupEventListeners(): void
  setupThemeChangeListener(): void
}

export type AdjustTextColor = (element: HTMLElement) => void
