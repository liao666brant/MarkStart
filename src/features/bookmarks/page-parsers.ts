export type BookmarkColors = {
  readonly primary: readonly number[]
  readonly secondary: readonly number[]
}

export type DefaultFolder = {
  readonly id: string
  readonly folderId?: string
  readonly name: string
  readonly order: number
}

export type OpenMultipleTabsResponse = {
  readonly success: boolean
  readonly error?: string
}

export function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getNumberProperty(value: unknown, key: string): number | undefined {
  if (!isUnknownRecord(value)) return undefined
  const property = value[key]
  return typeof property === 'number' && Number.isFinite(property) ? property : undefined
}

export function getBooleanProperty(value: unknown, key: string): boolean | undefined {
  if (!isUnknownRecord(value)) return undefined
  const property = value[key]
  return typeof property === 'boolean' ? property : undefined
}

export function getOpenMultipleTabsResponse(value: unknown): OpenMultipleTabsResponse | null {
  if (!isUnknownRecord(value) || typeof value['success'] !== 'boolean') return null
  const error = value['error']
  return typeof error === 'string'
    ? { success: value['success'], error }
    : { success: value['success'] }
}

export function isBookmarkColors(value: unknown): value is BookmarkColors {
  if (typeof value !== 'object' || value === null || !('primary' in value) || !('secondary' in value)) return false
  return Array.isArray(value.primary) && value.primary.every(color => typeof color === 'number') &&
    Array.isArray(value.secondary) && value.secondary.every(color => typeof color === 'number')
}

export function getDefaultFolders(value: unknown): DefaultFolder[] {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)) return []
  return value.items.filter((item): item is DefaultFolder =>
    typeof item === 'object' && item !== null &&
    'id' in item && typeof item.id === 'string' &&
    'name' in item && typeof item.name === 'string' &&
    'order' in item && typeof item.order === 'number')
}
