/**
 * One Obsidian vault on disk. The panel keeps a single directory.
 */
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_VAULT = '/Users/ruska/Documents/ob资料库'
const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', 'node_modules'])
const MAX_TREE_ENTRIES = 4000
const MAX_TEXT_BYTES = 1_500_000
const MAX_ASSET_BYTES = 25 * 1024 * 1024

export class VaultError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  ext?: string
  children?: TreeNode[]
}

export interface NoteIndexEntry {
  path: string
  stem: string
  ext: string
}

export function expandHome(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2))
  return trimmed
}

export async function assertDirectory(input: string): Promise<string> {
  const expanded = expandHome(input)
  if (!expanded) throw new VaultError('empty-path', '目录不能为空')
  const resolved = path.resolve(expanded)
  let info
  try {
    info = await stat(resolved)
  } catch {
    throw new VaultError('not-found', `找不到目录：${resolved}`)
  }
  if (!info.isDirectory()) throw new VaultError('not-directory', `不是文件夹：${resolved}`)
  return realpath(resolved)
}

function relativePath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}

export async function resolveInside(root: string, rel: string): Promise<string> {
  const rootReal = await realpath(root)
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleaned || cleaned.split('/').includes('..')) throw new VaultError('outside', '路径超出资料库')
  const target = path.resolve(rootReal, cleaned)
  const relToRoot = path.relative(rootReal, target)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) throw new VaultError('outside', '路径超出资料库')
  return target
}

async function walk(root: string, dir: string, budget: { left: number }): Promise<TreeNode[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  names.sort((a, b) => a.localeCompare(b, 'zh'))
  const dirs: TreeNode[] = []
  const files: TreeNode[] = []
  for (const name of names) {
    if (budget.left <= 0) break
    if (name.startsWith('.') || name === 'node_modules') continue
    const absolute = path.join(dir, name)
    let info
    try {
      info = await stat(absolute)
    } catch {
      continue
    }
    budget.left -= 1
    const rel = relativePath(root, absolute)
    if (info.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      dirs.push({ name, path: rel, type: 'dir', children: await walk(root, absolute, budget) })
    } else if (info.isFile()) {
      files.push({ name, path: rel, type: 'file', ext: path.extname(name).slice(1).toLowerCase() })
    }
  }
  return [...dirs, ...files]
}

export async function readTree(root: string): Promise<{ tree: TreeNode[]; truncated: boolean }> {
  const budget = { left: MAX_TREE_ENTRIES }
  const tree = await walk(root, root, budget)
  return { tree, truncated: budget.left <= 0 }
}

export function flatten(nodes: TreeNode[], into: NoteIndexEntry[] = []): NoteIndexEntry[] {
  for (const node of nodes) {
    if (node.type === 'file') {
      const ext = node.ext ?? ''
      const stem = ext ? node.name.slice(0, -(ext.length + 1)) : node.name
      into.push({ path: node.path, stem, ext })
    } else if (node.children) flatten(node.children, into)
  }
  return into
}

const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'csv', 'json', 'canvas', 'base', 'css', 'js', 'ts', 'yml', 'yaml'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'heic'])
const AUDIO_EXT = new Set(['m4a', 'mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'opus'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v'])

export function kindFor(ext: string): 'markdown' | 'pdf' | 'image' | 'audio' | 'video' | 'base' | 'text' | 'binary' {
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'base') return 'base'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (TEXT_EXT.has(ext)) return 'text'
  return 'binary'
}

export async function readNote(root: string, rel: string): Promise<{ text: string; bytes: number; mtime: number }> {
  const absolute = await resolveInside(root, rel)
  const info = await stat(absolute)
  if (!info.isFile()) throw new VaultError('not-file', '不是文件')
  if (info.size > MAX_TEXT_BYTES) throw new VaultError('too-large', '笔记太大，阅读视图只打开 1.5 MB 以内的文本')
  const text = await readFile(absolute, 'utf8')
  return { text, bytes: info.size, mtime: info.mtimeMs }
}

export async function readAsset(root: string, rel: string): Promise<{ absolute: string; bytes: number }> {
  const absolute = await resolveInside(root, rel)
  const info = await stat(absolute)
  if (!info.isFile()) throw new VaultError('not-file', '不是文件')
  if (info.size > MAX_ASSET_BYTES) throw new VaultError('too-large', '附件超过 25 MB，面板里不预览')
  return { absolute, bytes: info.size }
}

const WIKI = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

export function wikiTargets(markdown: string): string[] {
  const found = new Set<string>()
  for (const match of markdown.matchAll(WIKI)) {
    const raw = match[1]?.trim()
    if (raw) found.add(raw)
  }
  return [...found]
}

export function findByTarget(index: NoteIndexEntry[], target: string): NoteIndexEntry | undefined {
  const cleaned = target.replace(/\\/g, '/').replace(/^\.\//, '')
  const base = path.posix.basename(cleaned)
  const stem = base.replace(/\.[^.]+$/, '')
  const exact = index.find((entry) => entry.path === cleaned || entry.path === `${cleaned}.md`)
  if (exact) return exact
  const byName = index.filter((entry) => entry.stem === stem || entry.stem === base || path.posix.basename(entry.path) === base)
  return byName[0]
}
