import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerRoutes } from '../src/rpc.ts'

const root = '/Users/ruska/Documents/ob资料库'
const calls = []
const ctx = {
  webServer: { register: (options) => { calls.push(options); return () => {} } },
  connection: { requestRejection: () => undefined },
}
let currentRoot = root
const store = { getPath: () => currentRoot, setPath: async (p) => ({ vaultPath: p, saved: 'file' }) }
registerRoutes(ctx, store)
assert.ok(calls.length === 1 && calls[0].kind === 'prefix' && calls[0].path === '/dsh-notta')

const server = http.createServer((req, res) => { void calls[0].handler(req, res) })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

async function rpc(op, payload) {
  const res = await fetch(`${base}/dsh-notta/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, payload }),
  })
  return { status: res.status, body: await res.json() }
}

const status = await rpc('status')
assert.equal(status.status, 200)
assert.equal(status.body.ok, true)
assert.equal(status.body.value.vaultPath, root)
console.log('status OK', status.body.value.vaultPath)

const tree = await rpc('tree')
assert.equal(tree.body.ok, true)
const paths = tree.body.value.index.map((e) => e.path)
assert.ok(paths.some((p) => p.endsWith('.md')))
assert.equal(tree.body.value.tree.some((n) => n.name === '.obsidian'), false)
console.log('tree OK', paths.length, 'files')

const firstNotePath = paths.find((p) => p.endsWith('.md'))
const note = await rpc('read', { path: firstNotePath })
assert.equal(note.body.ok, true)
const doc = note.body.value
assert.equal(doc.kind, 'markdown')
assert.ok(Array.isArray(doc.properties))
for (const item of doc.properties) {
  assert.ok(['text', 'list', 'tags', 'number', 'checkbox', 'date', 'datetime', 'link'].includes(item.kind))
}
assert.ok(!doc.text.startsWith('---'), 'frontmatter was not stripped')
console.log('read OK props', doc.properties.length, 'embeds', Object.keys(doc.embeds).length)

const pdf = await rpc('read', { path: '个人杂项/财务/发票/26332000009560755366.pdf' })
assert.equal(pdf.body.value.kind, 'pdf')
const asset = await fetch(`${base}/dsh-notta/asset?path=${encodeURIComponent('个人杂项/财务/发票/26332000009560755366.pdf')}`)
assert.equal(asset.status, 200)
assert.equal(asset.headers.get('content-type'), 'application/pdf')
assert.ok((await asset.arrayBuffer()).byteLength > 50000)
console.log('asset OK pdf bytes', asset.headers.get('content-length') ?? 'streamed')

const css = await fetch(`${base}/dsh-notta/vendor/katex.min.css`)
assert.equal(css.status, 200)
assert.match(css.headers.get('content-type'), /text\/css/)
assert.match(await css.text(), /KaTeX_AMS-Regular/)
const font = await fetch(`${base}/dsh-notta/vendor/KaTeX_AMS-Regular.woff2`)
assert.equal(font.status, 200)
console.log('vendor OK css + font')

const pdfModule = await fetch(`${base}/dsh-notta/vendor/pdf.min.mjs`)
assert.equal(pdfModule.status, 200)
assert.match(pdfModule.headers.get('content-type'), /text\/javascript/)
const pdfWorker = await fetch(`${base}/dsh-notta/vendor/pdf.worker.min.mjs`)
assert.equal(pdfWorker.status, 200)
assert.ok((await pdfWorker.arrayBuffer()).byteLength > 100000)

const mermaid = await fetch(`${base}/dsh-notta/vendor/mermaid.min.js`)
assert.equal(mermaid.status, 200)
console.log('vendor OK mermaid bytes', (await mermaid.arrayBuffer()).byteLength)

const escape = await rpc('read', { path: '../../../../etc/passwd' })
assert.equal(escape.body.ok, false)
assert.equal(escape.body.error.code, 'outside')
const badVault = await rpc('setVault', { path: '/definitely/not/here' })
assert.equal(badVault.body.ok, false)
assert.equal(badVault.body.error.code, 'not-found')
console.log('guards OK:', escape.body.error.code, '/', badVault.body.error.code)

const byPath = await rpc('search', { query: 'path:"个人杂项/财务/发票"' })
assert.equal(byPath.body.ok, true)
assert.equal(byPath.body.value.hits.length, 3)
assert.ok(byPath.body.value.hits.every((hit) => hit.path.endsWith('.pdf')))
console.log('search path OK', byPath.body.value.hits.length, 'hits')

const byTag = await rpc('search', { query: 'tag:格式' })
assert.equal(byTag.body.ok, true)
assert.ok(byTag.body.value.hits.some((hit) => hit.path === '笔记1.md'))
console.log('search tag OK', byTag.body.value.hits.map((hit) => hit.path).join(', '))

const byWord = await rpc('search', { query: '笔记2' })
assert.equal(byWord.body.ok, true)
assert.ok(byWord.body.value.hits.some((hit) => hit.path === '笔记1.md'))
assert.ok(byWord.body.value.hits[0].count >= 2)
console.log('search word OK', byWord.body.value.hits.length, 'hits')

const empty = await rpc('search', { query: '   ' })
assert.equal(empty.body.ok, false)
assert.equal(empty.body.error.code, 'empty-query')

const unknown = await rpc('nope')
assert.equal(unknown.body.ok, false)
console.log('unknown op OK:', unknown.body.error.code)

// Image embedding: attachments resolve by vault name, not just by literal path.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const tempVault = await mkdtemp(path.join(os.tmpdir(), 'dsh-notta-vault-'))
await mkdir(path.join(tempVault, '附件'), { recursive: true })
await writeFile(path.join(tempVault, '附件', '照片.png'), PNG)
await writeFile(path.join(tempVault, '发票.pdf'), Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'))
await writeFile(path.join(tempVault, '录音.m4a'), Buffer.from('00000020667479704d34412000', 'hex'))
await writeFile(path.join(tempVault, '笔记.md'), [
  '# 图片',
  '',
  '![[照片.png]]',
  '',
  '![[照片.png|120]]',
  '',
  '![](附件/照片.png)',
  '',
  '![[不存在.png]]',
  '',
  '![[发票.pdf#page=1&height=280]]',
  '',
  '![[录音.m4a]]',
  '',
].join('\n'))
currentRoot = tempVault

const imageNote = await rpc('read', { path: '笔记.md' })
assert.equal(imageNote.body.ok, true)
const imageDoc = imageNote.body.value
assert.equal(imageDoc.files['照片.png'].path, '附件/照片.png')
assert.equal(imageDoc.files['照片.png'].kind, 'image')
assert.equal(imageDoc.files['附件/照片.png'].kind, 'image')
assert.equal(imageDoc.files['不存在.png'], undefined)
console.log('image index OK ->', imageDoc.files['照片.png'].path)
assert.equal(imageDoc.files['发票.pdf'].kind, 'pdf')
assert.equal(imageDoc.files['录音.m4a'].kind, 'audio')

const imageAsset = await fetch(`${base}/dsh-notta/asset?path=${encodeURIComponent('附件/照片.png')}`)
assert.equal(imageAsset.status, 200)
assert.equal(imageAsset.headers.get('content-type'), 'image/png')
assert.ok((await imageAsset.arrayBuffer()).byteLength > 40)
console.log('image asset OK png')

const audioAsset = await fetch(`${base}/dsh-notta/asset?path=${encodeURIComponent('录音.m4a')}`)
assert.equal(audioAsset.status, 200)
assert.equal(audioAsset.headers.get('content-type'), 'audio/mp4')
console.log('audio asset OK m4a')

const svgEscape = await rpc('read', { path: '../照片.png' })
assert.equal(svgEscape.body.ok, false)
currentRoot = root
await rm(tempVault, { recursive: true, force: true })

// Bases: a .base file is a saved view definition over the vault.
const baseVault = await mkdtemp(path.join(os.tmpdir(), 'dsh-notta-base-'))
await writeFile(path.join(baseVault, '甲.md'), ['---', 'tags:', '  - 项目', '状态: 进行中', '---', '', '# 甲', ''].join('\n'))
await writeFile(path.join(baseVault, '乙.md'), ['---', 'tags:', '  - 归档', '状态: 完成', '---', '', '# 乙', ''].join('\n'))
await writeFile(path.join(baseVault, '丙.pdf'), Buffer.from('%PDF-1.4\n%%EOF\n'))
await writeFile(path.join(baseVault, '视图.base'), [
  'views:',
  '  - type: table',
  '    name: 全部',
  '    sort:',
  '      - property: file.name',
  '        direction: ASC',
  '  - type: table',
  '    name: 只有笔记',
  '    filters: file.ext == "md"',
  '    limit: 10',
  '  - type: table',
  '    name: 倒序',
  '    sort:',
  '      - property: file.name',
  '        direction: DESC',
  '',
].join('\n'))
currentRoot = baseVault

const baseDoc = await rpc('read', { path: '视图.base' })
assert.equal(baseDoc.body.ok, true)
assert.equal(baseDoc.body.value.kind, 'base')
const views = baseDoc.body.value.base.views
assert.equal(views.length, 3)
assert.deepEqual(views[0].columns, ['file.name'])
const baseNames = views[0].rows.map((row) => row.name)
const reversed = views[2].rows.map((row) => row.name)
assert.equal(baseNames.length, 4)
assert.equal(new Set(baseNames).size, 4)
// The DESC view is the ASC view reversed, whatever the collation is.
assert.deepEqual(reversed, [...baseNames].reverse())
assert.ok(views[1].rows.every((row) => row.ext === 'md'))
assert.equal(views[1].rows.length, 2)
console.log('base views OK:', views.map((view) => `${view.name}=${view.rows.length}`).join(', '))

const added = await rpc('base.addView', { path: '视图.base', type: 'table', name: '视图' })
assert.equal(added.body.ok, true)
assert.equal(added.body.value.base.views.length, 4)
assert.match(added.body.value.base.views[3].name, /^视图/)
const written = await readFile(path.join(baseVault, '视图.base'), 'utf8')
assert.match(written, /views:/)
assert.equal((written.match(/- type: table/g) ?? []).length, 4)
console.log('base addView OK ->', added.body.value.base.views.map((view) => view.name).join(', '))

const removed = await rpc('base.deleteView', { path: '视图.base', view: '视图' })
assert.equal(removed.body.ok, true)
assert.equal(removed.body.value.base.views.length, 3)
const afterDelete = await readFile(path.join(baseVault, '视图.base'), 'utf8')
assert.equal((afterDelete.match(/- type: table/g) ?? []).length, 3)

const missing = await rpc('base.deleteView', { path: '视图.base', view: '并不存在' })
assert.equal(missing.body.ok, false)
assert.equal(missing.body.error.code, 'not-found')

await writeFile(path.join(baseVault, '单个.base'), 'views:\n  - type: table\n    name: 唯一\n')
const lastOne = await rpc('base.deleteView', { path: '单个.base', view: '唯一' })
assert.equal(lastOne.body.ok, false)
assert.equal(lastOne.body.error.code, 'last-view')
console.log('base deleteView OK -> 3 views left, guards hold')

const renamed = await rpc('base.renameView', { path: '视图.base', view: '倒序', to: '倒序2' })
assert.equal(renamed.body.ok, true)
assert.ok(renamed.body.value.base.views.some((view) => view.name === '倒序2'))
const renamedFile = await readFile(path.join(baseVault, '视图.base'), 'utf8')
assert.match(renamedFile, /倒序2/)

const kanban = await rpc('base.setLayout', { path: '视图.base', view: '全部', type: 'kanban' })
assert.equal(kanban.body.ok, true)
assert.equal(kanban.body.value.base.views.find((view) => view.name === '全部').type, 'kanban')

const filtered = await rpc('base.setFilter', { path: '视图.base', view: '全部', expression: 'file.ext == "md"' })
assert.equal(filtered.body.ok, true)
assert.equal(filtered.body.value.base.views.find((view) => view.name === '全部').total, 2)

const moved = await rpc('base.moveView', { path: '视图.base', view: '倒序2', index: 0 })
assert.equal(moved.body.ok, true)
assert.equal(moved.body.value.base.views[0].name, '倒序2')

const badLayout = await rpc('base.setLayout', { path: '视图.base', view: '全部', type: 'map' })
assert.equal(badLayout.body.ok, false)
assert.equal(badLayout.body.error.code, 'bad-request')

const clash = await rpc('base.renameView', { path: '视图.base', view: '全部', to: '倒序2' })
assert.equal(clash.body.ok, false)
assert.equal(clash.body.error.code, 'bad-name')
console.log('base edit ops OK -> rename / layout / filter / move / guards')

const newNote = await rpc('fs.createNote', { dir: '', name: '新笔记' })
assert.equal(newNote.body.ok, true)
assert.equal(newNote.body.value.path, '新笔记.md')
assert.equal(await readFile(path.join(baseVault, '新笔记.md'), 'utf8'), '')

const newFolder = await rpc('fs.createFolder', { dir: '', name: '新文件夹' })
assert.equal(newFolder.body.ok, true)
assert.equal(newFolder.body.value.path, '新文件夹')

const nestedNote = await rpc('fs.createNote', { dir: '新文件夹', name: '里面的笔记' })
assert.equal(nestedNote.body.ok, true)
assert.equal(nestedNote.body.value.path, '新文件夹/里面的笔记.md')

const duplicate = await rpc('fs.createNote', { dir: '', name: '新笔记' })
assert.equal(duplicate.body.ok, false)
assert.equal(duplicate.body.error.code, 'exists')

const slash = await rpc('fs.createNote', { dir: '', name: '../逃逸' })
assert.equal(slash.body.ok, false)
assert.equal(slash.body.error.code, 'bad-name')
console.log('create ops OK -> note / folder / nested / guards')

const autoNote = await rpc('fs.createNote', { dir: '' })
assert.equal(autoNote.body.value.path, '未命名.md')
const autoNote2 = await rpc('fs.createNote', { dir: '' })
assert.equal(autoNote2.body.value.path, '未命名 1.md')
const autoFolder = await rpc('fs.createFolder', { dir: '新文件夹' })
assert.equal(autoFolder.body.value.path, '新文件夹/未命名')

const renamedEntry = await rpc('fs.rename', { path: '未命名.md', name: '改过名.md' })
assert.equal(renamedEntry.body.ok, true)
assert.equal(renamedEntry.body.value.path, '改过名.md')
assert.equal(await readFile(path.join(baseVault, '改过名.md'), 'utf8'), '')

const movedEntry = await rpc('fs.move', { path: '改过名.md', dir: '新文件夹' })
assert.equal(movedEntry.body.ok, true)
assert.equal(movedEntry.body.value.path, '新文件夹/改过名.md')

const intoItself = await rpc('fs.move', { path: '新文件夹', dir: '新文件夹/未命名' })
assert.equal(intoItself.body.ok, false)
assert.equal(intoItself.body.error.code, 'bad-target')

const backToRoot = await rpc('fs.move', { path: '新文件夹/改过名.md', dir: '' })
assert.equal(backToRoot.body.ok, true)
assert.equal(backToRoot.body.value.path, '改过名.md')
console.log('auto-name / rename / move OK -> 未命名, 未命名 1, rename, move, guards')

const doomed = await rpc('fs.createNote', { dir: '', name: '待删' })
assert.equal(doomed.body.ok, true)
const removedNote = await rpc('fs.delete', { path: '待删.md' })
assert.equal(removedNote.body.ok, true)
assert.ok(removedNote.body.value.trashed.startsWith('.trash/'))
assert.equal(await stat(path.join(baseVault, '待删.md')).then(() => true).catch(() => false), false)
assert.equal(await stat(path.join(baseVault, removedNote.body.value.trashed)).then(() => true).catch(() => false), true)

const removedFolder = await rpc('fs.delete', { path: '新文件夹' })
assert.equal(removedFolder.body.ok, true)
assert.equal(await stat(path.join(baseVault, '新文件夹')).then(() => true).catch(() => false), false)

const rootDelete = await rpc('fs.delete', { path: '' })
assert.equal(rootDelete.body.ok, false)
assert.equal(rootDelete.body.error.code, 'bad-request')
console.log('delete OK -> note and folder moved to .trash, root guarded')

// Editing: write text back, and refuse a stale write unless forced.
const editTarget = await rpc('fs.createNote', { dir: '', name: '编辑测试' })
assert.equal(editTarget.body.ok, true)
const beforeWrite = await rpc('read', { path: '编辑测试.md' })
const stamp = beforeWrite.body.value.mtime
assert.equal(typeof stamp, 'number')

const savedNote = await rpc('fs.write', { path: '编辑测试.md', text: '# 改过了\n', mtime: stamp })
assert.equal(savedNote.body.ok, true)
assert.equal(await readFile(path.join(baseVault, '编辑测试.md'), 'utf8'), '# 改过了\n')
assert.notEqual(savedNote.body.value.mtime, stamp)

const stale = await rpc('fs.write', { path: '编辑测试.md', text: '旧内容', mtime: stamp })
assert.equal(stale.body.ok, false)
assert.equal(stale.body.error.code, 'conflict')

const forced = await rpc('fs.write', { path: '编辑测试.md', text: '强制写入', mtime: stamp, force: true })
assert.equal(forced.body.ok, true)
assert.equal(await readFile(path.join(baseVault, '编辑测试.md'), 'utf8'), '强制写入')

const wrongType = await rpc('fs.write', { path: '丙.pdf', text: 'x', mtime: stamp, force: true })
assert.equal(wrongType.body.ok, false)
assert.equal(wrongType.body.error.code, 'not-text')
console.log('write OK -> save, mtime bump, conflict, force, type guard')

const noteProps = await rpc('read', { path: '甲.md' })
assert.deepEqual(noteProps.body.value.properties.map((item) => item.key), ['tags', '状态'])
currentRoot = root
await rm(baseVault, { recursive: true, force: true })

// Live updates: the SSE endpoint announces changes made on disk.
const watchRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-notta-watch-'))
currentRoot = watchRoot

const controller = new AbortController()
const stream = await fetch(`${base}/dsh-notta/events`, { signal: controller.signal })
assert.equal(stream.status, 200)
assert.match(stream.headers.get('content-type'), /text\/event-stream/)
const reader = stream.body.getReader()
const decoder = new TextDecoder()
const first = await reader.read()
assert.match(decoder.decode(first.value), /"type":"ready"/)

// macOS FSEvents needs a moment to subscribe before a write is observed.
await new Promise((resolve) => setTimeout(resolve, 400))
await writeFile(path.join(watchRoot, '一点.md'), '# 一点\n')

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), ms)),
])
let pending = ''
for (let attempt = 0; attempt < 4; attempt += 1) {
  const chunk = await withTimeout(reader.read(), 1500)
  if (chunk.timeout) break
  pending += decoder.decode(chunk.value)
  if (pending.includes('"type":"change"')) break
}
assert.match(pending, /"type":"change"/)
controller.abort()

currentRoot = root
await rm(watchRoot, { recursive: true, force: true })
console.log('live updates OK -> SSE ready + change frame')

// The SSE stream keeps a socket open; close it so the test process can exit.
server.closeAllConnections?.()
server.close()
console.log('ALL ROUTE TESTS PASSED')
