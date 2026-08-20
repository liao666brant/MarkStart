import type { BookmarkColors } from './page-parsers'

type ColorHandlers = {
  readonly getColors: (image: HTMLImageElement) => BookmarkColors
  readonly applyColors: (card: HTMLElement, colors: BookmarkColors) => void
}

const fallbackColors: BookmarkColors = {
  primary: [200, 200, 200],
  secondary: [220, 220, 220],
}

export function updateBookmarkCard(
  bookmarkId: string,
  newTitle: string,
  newUrl: string,
  handlers: ColorHandlers,
): void {
  const bookmarkCard = document.querySelector<HTMLElement>(`.bookmark-card[data-id="${CSS.escape(bookmarkId)}"]`)
  if (!bookmarkCard) return

  if (bookmarkCard instanceof HTMLAnchorElement) {
    bookmarkCard.href = newUrl
  }

  const title = bookmarkCard.querySelector<HTMLElement>('.card-title')
  if (title) title.textContent = newTitle

  const image = bookmarkCard.querySelector<HTMLImageElement>('img')
  if (!image) return

  localStorage.removeItem(`bookmark-colors-${bookmarkId}`)
  image.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(newUrl)}&size=32&t=${Date.now()}`
  image.onload = () => {
    const colors = handlers.getColors(image)
    handlers.applyColors(bookmarkCard, colors)
    localStorage.setItem(`bookmark-colors-${bookmarkId}`, JSON.stringify(colors))
  }
  image.onerror = () => {
    handlers.applyColors(bookmarkCard, fallbackColors)
    localStorage.setItem(`bookmark-colors-${bookmarkId}`, JSON.stringify(fallbackColors))
  }
}
