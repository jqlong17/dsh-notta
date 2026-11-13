/**
 * Same-origin RPC for the notes panel.
 *
 * POST /dsh-notta/rpc  { op, payload }
 * GET  /dsh-notta/asset?path=
 * GET  /dsh-notta/vendor/katex/<file>
 */
import { createReadStream, watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addView,
  deleteView,
  moveView,
  parseBase,
  renameView,
  setFilters,
  setViewOption,
  stringifyBase,
  uniqueViewName,
  viewNameError,
} from '@type32/obsidian-bases-parser'

import { renderBase } from './bases.ts'
import { splitFrontmatter, type NoteProperty } from './frontmatter.ts'

import { readSavedPath, settingsFile, writeSavedPath, type NottaConfig } from './settings.ts'
import {
  VaultError,
  assertDirectory,
  expandHome,
  findByTarget,
  flatten,
  kindFor,
  readAsset,
  readNote,
  readTree,
  resolveInside,
  wikiTargets,
} from './vault.ts'

export const ROUTE_PREFIX = '/dsh-notta'
const RPC_PATH = `${ROUTE_PREFIX}/rpc`
const ASSET_PATH = `${ROUTE_PREFIX}/asset`
const VENDOR_PREFIX = `${ROUTE_PREFIX}/vendor/`
const EVENTS_PATH = `${ROUTE_PREFIX}/events`
const MAX_BODY_BYTES = 64 * 1024

interface HostContext {
  webServer?: {
    register(options: { kind: 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  }
  connection?: { requestRejection(req: IncomingMessage): number | undefined }
  get?(name: string): unknown
  fiber?: { entry?: { id?: string; options?: { name?: string } } }
}

export interface VaultStore {
  getPath(): string
  setPath(next: string): Promise<{ vaultPath: string; saved: 'config' | 'file' }>
}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new VaultError('payload', '请求体过大')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  return JSON.parse(text) as unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Minimal Obsidian search subset: path:, file:, tag: and bare words. */
interface QueryTerm {
  field: 'path' | 'file' | 'tag' | 'text'
  value: string
}

export interface SearchHit {
  path: string
  title: string
  kind: string
  count: number
}

function parseQuery(input: string): QueryTerm[] {
  const terms: QueryTerm[] = []
  const pattern = /(path|file|tag|content):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    const field = (match[1] ?? '').toLowerCase()
    const quoted = match[2]
    const bare = match[3]
    const freeQuoted = match[4]
    const free = match[5]
    const value = quoted ?? bare ?? freeQuoted ?? free ?? ''
    if (!value) continue
    const mapped: QueryTerm['field'] = field === 'path' || field === 'file' || field === 'tag'
      ? field
      : 'text'
    terms.push({ field: mapped, value })
  }
  return terms
}

async function runSearch(root: string, query: string): Promise<SearchHit[]> {
  const terms = parseQuery(query)
  if (terms.length === 0) return []
  const listed = await readTree(root)
  const index = flatten(listed.tree)
  const hits: SearchHit[] = []
  let scanned = 0
  for (const entry of index) {
    if (hits.length >= 30) break
    const lowerPath = entry.path.toLowerCase()
    const lowerName = (entry.path.split('/').pop() ?? '').toLowerCase()
    let count = 0
    let content: string | undefined
    let tags: string[] = []
    const needsContent = terms.some((term) => term.field === 'tag' || term.field === 'text')
    if (needsContent && (entry.ext === 'md' || entry.ext === 'markdown' || entry.ext === 'txt' || entry.ext === 'base' || entry.ext === 'canvas')) {
      if (scanned >= 300) continue
      scanned += 1
      try {
        const raw = (await readNote(root, entry.path)).text
        content = raw.toLowerCase()
        const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
        if (front) {
          try {
            const parsed = parseYaml(front[1] ?? '') as { tags?: unknown } | null
            const listedTags = parsed?.tags
            tags = Array.isArray(listedTags)
              ? listedTags.map((item) => String(item).toLowerCase())
              : typeof listedTags === 'string' ? [listedTags.toLowerCase()] : []
          } catch {
            tags = []
          }
        }
      } catch {
        content = undefined
      }
    }
    let ok = true
    for (const term of terms) {
      const needle = term.value.toLowerCase()
      let found = 0
      if (term.field === 'path') found = lowerPath.includes(needle) ? 1 : 0
      else if (term.field === 'file') found = lowerName.includes(needle) ? 1 : 0
      else if (term.field === 'tag') {
        const hit = content?.includes(`#${needle}`)
          || tags.some((tag) => tag === needle || tag.startsWith(`${needle}/`))
        found = hit ? 1 : 0
      } else found = content ? content.split(needle).length - 1 : (lowerPath.includes(needle) ? 1 : 0)
      if (found === 0) {
        ok = false
        break
      }
      count += found
    }
    if (!ok) continue
    hits.push({
      path: entry.path,
      title: entry.stem,
      kind: kindFor(entry.ext),
      count: Math.max(count, 1),
    })
  }
  hits.sort((left, right) => right.count - left.count || left.path.localeCompare(right.path, 'zh'))
  return hits
}

async function browse(dirInput: string): Promise<unknown> {
  let dir: string
  try {
    dir = await assertDirectory(dirInput)
  } catch {
    // The stored vault may be gone; fall back to its parent, then to home, so
    // the picker still opens instead of trapping the user.
    const parent = path.dirname(expandHome(dirInput))
    dir = await assertDirectory(parent).catch(() => assertDirectory(os.homedir()))
  }
  const parent = path.dirname(dir)
  const { readdir, stat } = await import('node:fs/promises')
  const names = await readdir(dir)
  const dirs: Array<{ name: string; path: string }> = []
  for (const name of names.sort((a, b) => a.localeCompare(b, 'zh'))) {
    if (name.startsWith('.')) continue
    try {
      const absolute = path.join(dir, name)
      if ((await stat(absolute)).isDirectory()) dirs.push({ name, path: absolute })
    } catch {
      continue
    }
  }
  return { path: dir, parent: parent === dir ? null : parent, dirs }
}

async function dispatch(store: VaultStore, op: string, payload: Record<string, unknown>): Promise<unknown> {
  if (op === 'status') {
    let exists = false
    try {
      await assertDirectory(store.getPath())
      exists = true
    } catch {
      exists = false
    }
    return { vaultPath: store.getPath(), exists, settingsFile: settingsFile() }
  }
  if (op === 'setVault') {
    const next = await assertDirectory(String(payload.path || ''))
    const saved = await store.setPath(next)
    return saved
  }
  if (op === 'browse') {
    const start = typeof payload.path === 'string' && payload.path.trim() ? payload.path : store.getPath()
    return browse(start)
  }
  const root = await assertDirectory(store.getPath())
  if (op === 'tree') {
    const listed = await readTree(root)
    return { vaultPath: root, ...listed, index: flatten(listed.tree) }
  }
  if (op === 'fs.write') {
    const rel = String(payload.path || '')
    if (!/\.(md|markdown|txt|canvas|base)$/i.test(rel)) {
      throw new VaultError('not-text', '这里只能保存文本笔记')
    }
    const text = String(payload.text ?? '')
    if (text.length > 2_000_000) throw new VaultError('too-large', '内容超过 2 MB，面板里不保存')
    const absolute = await resolveInside(root, rel)
    const info = await stat(absolute).catch(() => undefined)
    if (!info) throw new VaultError('not-found', '文件已经不在了')
    const expected = Number(payload.mtime)
    const force = payload.force === true
    if (!force && Number.isFinite(expected) && Math.abs(info.mtimeMs - expected) > 1) {
      throw new VaultError('conflict', '文件在磁盘上被改过了，先决定要不要覆盖')
    }
    // Atomic: write beside the target, then rename over it.
    const temporary = `${absolute}.dsh-notta-${process.pid}.tmp`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, absolute)
    const after = await stat(absolute)
    return { path: rel, mtime: after.mtimeMs, bytes: after.size }
  }
  if (op === 'fs.delete') {
    const rel = String(payload.path || '').replace(/^\/+/, '')
    if (!rel) throw new VaultError('bad-request', '不能删除资料库根目录')
    const absolute = await resolveInside(root, rel)
    const info = await stat(absolute).catch(() => undefined)
    if (!info) throw new VaultError('not-found', '找不到要删除的条目')
    const trash = path.join(root, '.trash')
    await mkdir(trash, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = path.join(trash, `${stamp}-${path.basename(absolute)}`)
    await rename(absolute, target)
    return { path: rel, trashed: path.relative(root, target).split(path.sep).join('/') }
  }
  if (op === 'fs.createNote' || op === 'fs.createFolder'
    || op === 'fs.rename' || op === 'fs.move') {
    const from = String(payload.path || '').replace(/^\/+/, '')
    const rawName = String(payload.name || '').trim()
    if (rawName && (/[\\/]/.test(rawName) || rawName === '.' || rawName === '..')) {
      throw new VaultError('bad-name', '名称不能包含 / 或 \\')
    }

    const relToRoot = (absolute: string): string => {
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new VaultError('outside', '路径超出资料库')
      }
      return relative
    }

    if (op === 'fs.rename') {
      if (!from) throw new VaultError('bad-request', '缺少原路径')
      if (!rawName) throw new VaultError('bad-name', '名称不能为空')
      const absolute = await resolveInside(root, from)
      const target = path.join(path.dirname(absolute), rawName)
      const nextRel = relToRoot(target)
      if (nextRel === from) return { path: from, kind: 'file' }
      if (await stat(target).then(() => true).catch(() => false)) {
        throw new VaultError('exists', `已经有一个叫「${rawName}」的条目了`)
      }
      await rename(absolute, target)
      return { path: nextRel, kind: 'file' }
    }

    if (op === 'fs.move') {
      if (!from) throw new VaultError('bad-request', '缺少原路径')
      const dirInput = String(payload.dir || '').replace(/^\/+/, '')
      const absolute = await resolveInside(root, from)
      const dirAbs = dirInput ? await resolveInside(root, dirInput) : root
      const targetRel = relToRoot(path.join(dirAbs, path.basename(absolute)))
      if (targetRel === from) return { path: from, kind: 'file' }
      if (targetRel.startsWith(`${from}/`)) throw new VaultError('bad-target', '不能把文件夹移动到它自己里面')
      const info = await stat(absolute).catch(() => undefined)
      if (!info) throw new VaultError('not-found', '找不到要移动的条目')
      if (await stat(path.join(dirAbs, path.basename(absolute))).then(() => true).catch(() => false)) {
        throw new VaultError('exists', `目标文件夹里已经有「${path.basename(absolute)}」了`)
      }
      await rename(absolute, path.join(dirAbs, path.basename(absolute)))
      return { path: targetRel, kind: info.isDirectory() ? 'dir' : 'file' }
    }

    // Create: an omitted name means Obsidian's "未命名", made unique in the folder.
    const dirInput = String(payload.dir || '').replace(/^\/+/, '')
    const dirAbs = dirInput ? await resolveInside(root, dirInput) : root
    const noteMode = op === 'fs.createNote'
    let name = rawName
    if (!name) {
      const base = '未命名'
      name = noteMode ? `${base}.md` : base
      let counter = 1
      while (await stat(path.join(dirAbs, name)).then(() => true).catch(() => false)) {
        name = noteMode ? `${base} ${counter}.md` : `${base} ${counter}`
        counter += 1
      }
    } else if (noteMode && !/\.md$/i.test(name)) {
      name = `${name}.md`
    }
    const target = path.join(dirAbs, name)
    const createdRel = relToRoot(target)
    if (await stat(target).then(() => true).catch(() => false)) {
      throw new VaultError('exists', `已经有一个叫「${name}」的条目了`)
    }
    if (noteMode) await writeFile(target, '', 'utf8')
    else await mkdir(target)
    return { path: createdRel, kind: noteMode ? 'markdown' : 'dir' }
  }
  if (op === 'base.addView' || op === 'base.deleteView' || op === 'base.renameView'
    || op === 'base.setLayout' || op === 'base.setFilter' || op === 'base.moveView') {
    const rel = String(payload.path || '')
    if (!/\.base$/i.test(rel)) throw new VaultError('not-base', '只有 .base 文件能编辑视图')
    const absolute = await resolveInside(root, rel)
    const text = await readFile(absolute, 'utf8')
    const parsed = parseBase(text)
    if (parsed.error) throw new VaultError('base-parse', parsed.error)
    const base = parsed.base
    let next = base
    const view = typeof payload.view === 'string' ? payload.view : ''

    if (op === 'fs.write') {
    const rel = String(payload.path || '')
    if (!/\.(md|markdown|txt|canvas|base)$/i.test(rel)) {
      throw new VaultError('not-text', '这里只能保存文本笔记')
    }
    const text = String(payload.text ?? '')
    if (text.length > 2_000_000) throw new VaultError('too-large', '内容超过 2 MB，面板里不保存')
    const absolute = await resolveInside(root, rel)
    const info = await stat(absolute).catch(() => undefined)
    if (!info) throw new VaultError('not-found', '文件已经不在了')
    const expected = Number(payload.mtime)
    const force = payload.force === true
    if (!force && Number.isFinite(expected) && Math.abs(info.mtimeMs - expected) > 1) {
      throw new VaultError('conflict', '文件在磁盘上被改过了，先决定要不要覆盖')
    }
    // Atomic: write beside the target, then rename over it.
    const temporary = `${absolute}.dsh-notta-${process.pid}.tmp`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, absolute)
    const after = await stat(absolute)
    return { path: rel, mtime: after.mtimeMs, bytes: after.size }
  }
  if (op === 'fs.delete') {
    const rel = String(payload.path || '').replace(/^\/+/, '')
    if (!rel) throw new VaultError('bad-request', '不能删除资料库根目录')
    const absolute = await resolveInside(root, rel)
    const info = await stat(absolute).catch(() => undefined)
    if (!info) throw new VaultError('not-found', '找不到要删除的条目')
    const trash = path.join(root, '.trash')
    await mkdir(trash, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = path.join(trash, `${stamp}-${path.basename(absolute)}`)
    await rename(absolute, target)
    return { path: rel, trashed: path.relative(root, target).split(path.sep).join('/') }
  }
  if (op === 'fs.createNote' || op === 'fs.createFolder') {
    const dir = String(payload.dir || '').replace(/^\/+/, '')
    const name = String(payload.name || '').trim()
    if (!name) throw new VaultError('bad-name', '名称不能为空')
    if (/[\\/]/.test(name) || name === '.' || name === '..') throw new VaultError('bad-name', '名称不能包含 / 或 \\')
    const dirAbs = dir ? await resolveInside(root, dir) : root
    const target = path.join(dirAbs, op === 'fs.createNote' ? `${name}.md` : name)
    const relPath = path.relative(root, target).split(path.sep).join('/')
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
      throw new VaultError('outside', '路径超出资料库')
    }
    const exists = await stat(target).then(() => true).catch(() => false)
    if (exists) throw new VaultError('exists', `已经有一个叫「${path.basename(target)}」的条目标了`)
    if (op === 'fs.createNote') await writeFile(target, '', 'utf8')
    else await mkdir(target)
    return { path: relPath, kind: op === 'fs.createNote' ? 'markdown' : 'dir' }
  }
  if (op === 'base.addView') {
      next = addView(base, typeof payload.type === 'string' && payload.type.trim() ? payload.type.trim() : 'table')
      if (typeof payload.name === 'string' && payload.name.trim()) {
        const created = next.views[next.views.length - 1]?.name
        if (created) next = renameView(next, created, uniqueViewName(next, payload.name.trim()))
      }
    } else if (op === 'base.deleteView') {
      if (!view) throw new VaultError('bad-request', '缺少视图名')
      if (base.views.length <= 1) throw new VaultError('last-view', '至少要保留一个视图')
      if (!base.views.some((item) => item.name === view)) throw new VaultError('not-found', `没有叫「${view}」的视图`)
      next = deleteView(base, view)
    } else if (op === 'base.renameView') {
      const to = String(payload.to || '').trim()
      if (!view) throw new VaultError('bad-request', '缺少视图名')
      if (!to) throw new VaultError('bad-request', '新名称不能为空')
      const problem = viewNameError(base, to, view)
      if (problem) throw new VaultError('bad-name', problem)
      next = renameView(base, view, to)
    } else if (op === 'base.setLayout') {
      const type = String(payload.type || '')
      if (!['table', 'cards', 'list', 'board', 'kanban'].includes(type)) {
        throw new VaultError('bad-request', '不支持的布局')
      }
      next = setViewOption(base, view, 'type', type)
    } else if (op === 'base.setFilter') {
      const expression = typeof payload.expression === 'string' ? payload.expression.trim() : ''
      next = setFilters(base, view, expression ? expression : null)
    } else {
      const index = Number(payload.index)
      if (!Number.isInteger(index) || index < 0 || index >= base.views.length) {
        throw new VaultError('bad-request', '目标位置超出范围')
      }
      next = moveView(base, view, index)
    }

    const written = stringifyBase(next)
    await writeFile(absolute, written, 'utf8')
    return {
      path: rel,
      kind: 'base' as const,
      bytes: Buffer.byteLength(written, 'utf8'),
      title: path.posix.basename(rel, path.posix.extname(rel)),
      base: await renderBase(root, written, rel),
    }
  }
  if (op === 'search') {
    const query = String(payload.query || '')
    if (!query.trim()) throw new VaultError('empty-query', '搜索内容不能为空')
    return { query, hits: await runSearch(root, query) }
  }
  if (op === 'read') {
    const rel = String(payload.path || '')
    const ext = path.posix.extname(rel).slice(1).toLowerCase()
    const kind = kindFor(ext)
    if (kind === 'binary' || kind === 'pdf' || kind === 'image') {
      const asset = await readAsset(root, rel)
      return { path: rel, kind, bytes: asset.bytes, title: path.posix.basename(rel, path.posix.extname(rel)) }
    }
    const note = await readNote(root, rel)
    if (kind === 'base') {
      return {
        path: rel,
        kind,
        bytes: note.bytes,
        title: path.posix.basename(rel, path.posix.extname(rel)),
        base: await renderBase(root, note.text, rel),
      }
    }
    const split = kind === 'markdown' ? splitFrontmatter(note.text) : { properties: [], body: note.text }
    const listed = await readTree(root)
    const index = flatten(listed.tree)
    const embeds: Record<string, { markdown: string; title: string; path: string }> = {}
    const files: Record<string, { path: string; kind: string; ext: string }> = {}
    const noteDir = path.posix.dirname(rel)
    if (kind === 'markdown') {
      // Every wiki target resolves by vault name, so `![[photo.png]]` works no
      // matter which folder holds the attachment.
      for (const target of wikiTargets(split.body)) {
        const hit = findByTarget(index, target)
        if (!hit) continue
        const record = { path: hit.path, kind: kindFor(hit.ext), ext: hit.ext }
        files[target] = record
        if (!files[hit.path]) files[hit.path] = record
        if (hit.ext !== 'md' && hit.ext !== 'markdown') continue
        if (embeds[target] || embeds[hit.stem]) continue
        try {
          const linked = await readNote(root, hit.path)
          const body = splitFrontmatter(linked.text).body
          const embedded = { markdown: body, title: hit.stem, path: hit.path }
          embeds[target] = embedded
          embeds[hit.stem] = embedded
          embeds[hit.path] = embedded
        } catch {
          continue
        }
      }
      // Plain Markdown images resolve against the note's own folder first.
      for (const match of split.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const src = match[1] ?? ''
        if (!src || /^(https?:|data:)/i.test(src)) continue
        let decoded = src
        try {
          decoded = decodeURIComponent(src)
        } catch {
          decoded = src
        }
        const fromNote = path.posix.normalize(path.posix.join(noteDir === '.' ? '' : noteDir, decoded))
        const exact = index.find((entry) => entry.path === fromNote || entry.path === decoded)
        const hit = exact ?? findByTarget(index, path.posix.basename(decoded))
        if (!hit) continue
        const record = { path: hit.path, kind: kindFor(hit.ext), ext: hit.ext }
        files[src] = record
        if (!files[hit.path]) files[hit.path] = record
      }
    }
    return {
      path: rel,
      kind,
      bytes: note.bytes,
      title: path.posix.basename(rel, path.posix.extname(rel)),
      text: kind === 'markdown' ? split.body : note.text,
      mtime: note.mtime,
      properties: split.properties,
      embeds,
      files,
      noteDir,
    }
  }
  throw new VaultError('unknown-op', `未知操作：${op || '(空)'}`)
}

function vendorRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor')
}

export function registerRoutes(ctx: HostContext, store: VaultStore): () => void {
  const webServer = ctx.webServer
  if (!webServer) throw new Error('dsh-notta 需要 webServer，当前 profile 没有网页服务')

  // Live updates: one recursive watcher on the vault pushes "change" frames, so
  // the panel follows edits made in Obsidian or Finder without a manual reload.
  const clients = new Set<ServerResponse>()
  let watcher: FSWatcher | undefined
  let watchedRoot: string | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined

  const ensureWatch = async (): Promise<void> => {
    const root = await assertDirectory(store.getPath())
    if (watcher && watchedRoot === root) return
    watcher?.close()
    watchedRoot = root
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        const name = String(filename ?? '')
        if (name.startsWith('.trash') || name.startsWith('.obsidian')) return
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          for (const client of clients) client.write('data: {"type":"change"}\n\n')
        }, 250)
      })
      watcher.on('error', () => { watcher?.close(); watcher = undefined })
    } catch {
      watcher = undefined
    }
  }

  const disposeRoute = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const rejection = ctx.connection?.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      try {
        if (req.method === 'GET' && url.pathname.startsWith(VENDOR_PREFIX)) {
          const name = path.basename(url.pathname)
          if (name !== path.basename(decodeURIComponent(url.pathname.slice(VENDOR_PREFIX.length)))) {
            res.statusCode = 400
            res.end()
            return
          }
          const file = path.join(vendorRoot(), name)
          const ext = path.extname(name)
          res.statusCode = 200
          res.setHeader('content-type', MIME[ext] || 'application/octet-stream')
          res.setHeader('cache-control', 'public, max-age=86400')
          createReadStream(file).on('error', () => {
            if (!res.headersSent) res.statusCode = 404
            res.end()
          }).pipe(res)
          return
        }
        if (req.method === 'GET' && url.pathname === EVENTS_PATH) {
          await ensureWatch()
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            connection: 'keep-alive',
          })
          res.write('retry: 2000\n\n')
          res.write('data: {"type":"ready"}\n\n')
          clients.add(res)
          const ping = setInterval(() => { res.write(': ping\n\n') }, 25000)
          req.on('close', () => {
            clearInterval(ping)
            clients.delete(res)
          })
          return
        }
        if (req.method === 'GET' && url.pathname === ASSET_PATH) {
          const rel = url.searchParams.get('path') || ''
          const root = await assertDirectory(store.getPath())
          const asset = await readAsset(root, rel)
          const ext = path.extname(asset.absolute).toLowerCase()
          res.statusCode = 200
          res.setHeader('content-type', MIME[ext] || 'application/octet-stream')
          res.setHeader('content-disposition', 'inline')
          res.setHeader('cache-control', 'private, max-age=60')
          res.setHeader('x-content-type-options', 'nosniff')
          createReadStream(asset.absolute).pipe(res)
          return
        }
        if (req.method !== 'POST' || url.pathname !== RPC_PATH) {
          sendJson(res, 404, { ok: false, error: { code: 'not-found', message: '接口不存在' } })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const value = await dispatch(store, String(body.op || ''), asRecord(body.payload))
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const failure = error instanceof VaultError
          ? { code: error.code, message: error.message }
          : { code: 'failed', message: error instanceof Error ? error.message : String(error) }
        if (!res.headersSent) sendJson(res, 200, { ok: false, error: failure })
        else res.end()
      }
    },
  })

  return () => {
    disposeRoute()
    if (debounce) clearTimeout(debounce)
    watcher?.close()
    watcher = undefined
    for (const client of clients) client.end()
    clients.clear()
  }
}

export async function saveVaultPath(
  ctx: HostContext,
  config: NottaConfig,
  next: string,
  options: { config?: boolean } = {},
): Promise<'config' | 'file'> {
  const editor = options.config === false
    ? undefined
    : ctx.get?.('configEditor') as { edit?: (entry: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>) => Promise<void> } | undefined
  const entry = ctx.fiber?.entry
  if (editor?.edit && entry) {
    try {
      await editor.edit(entry, (current) => ({ ...current, ...config, vaultPath: next }))
      await writeSavedPath(next)
      return 'config'
    } catch {
      await writeSavedPath(next)
      return 'file'
    }
  }
  await writeSavedPath(next)
  return 'file'
}

export async function rememberedPath(): Promise<string | undefined> {
  return readSavedPath()
}
