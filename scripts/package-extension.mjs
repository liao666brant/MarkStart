import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { ZipArchive } from 'archiver'

const projectRoot = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(projectRoot, 'manifest.json'), 'utf8'))
const outputPath = resolve(
  projectRoot,
  'release',
  `TabMark-Bookmark-New-Tab-${manifest.version}.zip`,
)

await mkdir(dirname(outputPath), { recursive: true })

const output = createWriteStream(outputPath)
const archive = new ZipArchive({ zlib: { level: 9 } })
const completed = new Promise((resolveArchive, rejectArchive) => {
  output.on('close', resolveArchive)
  output.on('error', rejectArchive)
  archive.on('error', rejectArchive)
})

archive.pipe(output)
archive.directory(resolve(projectRoot, 'dist'), false)
await archive.finalize()
await completed

console.log(`Created ${outputPath}`)
