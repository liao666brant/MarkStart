import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'

const projectUrl = new URL('../', import.meta.url)

async function runStartupWallpaper(wallpaper: string, useDefaultBackground = false): Promise<{
  readonly accessedKeys: readonly string[]
  readonly classes: ReadonlySet<string>
  readonly hasGlobalWallpaperBinding: boolean
  readonly style: Readonly<Record<string, string>>
}> {
  const startupScript = await readFile(new URL('src/startup-wallpaper.ts', projectUrl), 'utf8')
  const accessedKeys: string[] = []
  const classes = new Set<string>()
  const styleValues = new Map<string, string>()
  const style = {
    setProperty: (name: string, value: string) => styleValues.set(name, value),
    set backgroundImage(value: string) { styleValues.set('backgroundImage', value) },
    set backgroundSize(value: string) { styleValues.set('backgroundSize', value) },
    set backgroundPosition(value: string) { styleValues.set('backgroundPosition', value) },
    set backgroundRepeat(value: string) { styleValues.set('backgroundRepeat', value) },
    set backgroundAttachment(value: string) { styleValues.set('backgroundAttachment', value) },
  }
  const storage = new Map([
    ['originalWallpaper', wallpaper],
    ['useDefaultBackground', String(useDefaultBackground)],
  ])

  const context = createContext({
    document: { body: { classList: { add: (name: string) => classes.add(name) }, style } },
    localStorage: { getItem: (key: string) => {
      accessedKeys.push(key)
      return storage.get(key) ?? null
    } },
  })
  runInContext(startupScript, context)

  return {
    accessedKeys,
    classes,
    hasGlobalWallpaperBinding: runInContext('typeof startupWallpaper !== "undefined"', context),
    style: Object.fromEntries(styleValues),
  }
}

test('loads the saved wallpaper through a parser-blocking external script', async () => {
  const indexSource = await readFile(new URL('src/index.html', projectUrl), 'utf8')
  const result = await runStartupWallpaper('chrome-extension://example/images/wallpapers/wallpaper-1.jpg')

  assert.match(indexSource, /<body[^>]*>\s*<script vite-ignore src="startup-wallpaper\.js"><\/script>/)
  assert.equal(result.style['backgroundImage'], 'url("chrome-extension://example/images/wallpapers/wallpaper-1.jpg")')
  assert.equal(result.style['--wallpaper-image'], result.style['backgroundImage'])
  assert.equal(result.classes.has('has-wallpaper'), true)
  assert.equal(result.hasGlobalWallpaperBinding, false)
})

test('does not copy an IndexedDB or legacy data wallpaper into the startup DOM', async () => {
  const [indexedDbResult, dataUrlResult] = await Promise.all([
    runStartupWallpaper('idb:wallpaper-1'),
    runStartupWallpaper('data:image/jpeg;base64,large-wallpaper'),
  ])

  assert.deepEqual(indexedDbResult.style, {})
  assert.deepEqual(dataUrlResult.style, {})
})

test('does not read a saved wallpaper when the default background is active', async () => {
  const result = await runStartupWallpaper('data:image/jpeg;base64,large-wallpaper', true)

  assert.deepEqual(result.accessedKeys, ['useDefaultBackground'])
  assert.deepEqual(result.style, {})
  assert.equal(result.hasGlobalWallpaperBinding, false)
})
