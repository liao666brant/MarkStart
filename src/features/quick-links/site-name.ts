function getVisualWidth(value: string): number {
  return value.split('').reduce((width, character) => (
    width + (/[一-龥]/.test(character) ? 2 : 1)
  ), 0)
}

function cleanTitle(value: string): string {
  if (!value) return ''

  let cleaned = value.replace(/\s*[-|·:]\s*.*$/, '')
  cleaned = cleaned.replace(/\s*(官方网站|首页|网|网站|官网)$/, '')

  if (cleaned.length > 20) {
    const parts = cleaned.split(/\s+/)
    cleaned = parts.length > 1 ? parts.slice(0, 2).join(' ') : cleaned.substring(0, 20)
  }

  return cleaned.trim() === '' ? cleaned : cleaned.trim()
}

export function getSiteName(title: string, url: string): string {
  const maxEnglishWidth = 16
  const maxChineseWidth = 14
  const maxMixedWidth = 15
  const cleanedTitle = cleanTitle(title)

  if (cleanedTitle.trim()) {
    const visualWidth = getVisualWidth(cleanedTitle)
    const chineseCharCount = (cleanedTitle.match(/[\u4e00-\u9fa5]/g) || []).length
    const chineseRatio = chineseCharCount / cleanedTitle.length
    const maxWidth = chineseRatio === 0
      ? maxEnglishWidth
      : chineseRatio === 1
        ? maxChineseWidth
        : Math.round(maxMixedWidth * (1 - chineseRatio) + maxChineseWidth * chineseRatio / 2)

    if (visualWidth <= maxWidth) return cleanedTitle

    let truncated = ''
    let currentWidth = 0
    for (const character of cleanedTitle) {
      const characterWidth = /[\u4e00-\u9fa5]/.test(character) ? 2 : 1
      if (currentWidth + characterWidth > maxWidth) break
      truncated += character
      currentWidth += characterWidth
    }
    return truncated
  }

  try {
    const hostname = new URL(url).hostname
    let name = hostname.replace(/^www\./, '').split('.')[0] ?? ''
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ')
    return getVisualWidth(name) > maxEnglishWidth ? name.substring(0, maxEnglishWidth) : name
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return 'Unknown Site'
  }
}
