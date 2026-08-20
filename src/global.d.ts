import type {
  AdjustTextColor,
  GetLocalizedMessage,
  UpdateUILanguage,
  WelcomeManagerContract,
} from './types'

declare global {
  interface Window {
    getLocalizedMessage: GetLocalizedMessage
    updateUILanguage: UpdateUILanguage
    WelcomeManager: WelcomeManagerContract
    adjustTextColor?: AdjustTextColor
  }
}

export {}
