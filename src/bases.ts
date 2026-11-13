/**
 * Bases: Obsidian's `.base` files are saved view definitions over the vault.
 * The query engine is `@type32/obsidian-bases-parser` (MIT), which reproduces
 * Obsidian 1.15's filters, formulas, sort, groups and summaries; this module
 * only feeds it the vault index and shapes the result for the panel.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'
import {
  parseBase,
  runQuery,
  toDisplay,
  type BaseFile,
  type Value,
} from '@type32/obsidian-bases-parser'

import { flatten, readTree } from './vault.ts'

export interface BaseRow {
  path: string
  name: string
  ext: string
  folder: string
  values: Record<string, string>
}

export interface BaseGroup {
  key: string | null
  rows: BaseRow[]
}

export interface BaseView {
  name: string
  type: string
  columns: string[]
  rows: BaseRow[]
  groups: BaseGroup[]
  summaries: Record<string, string>
  total: number
  note?: string
}

export interface BaseDocument {
  views: BaseView[]
  error?: string
}

const MAX_FILES = 2000
const WIKI = /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const TAG = /(^|[\s(（])#([^\s#)\]】，。、]+)/g

function formatDate(ms: number, withTime: boolean): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

/** Cell text the panel can render: dates in local order, links as wikilinks. */
function displayValue(value: Value): string {
  if (value.type === 'Date') return formatDate(value.ms, value.time)
  if (value.type === 'Link') {
    return value.display ? `[[${value.path}|${value.display}]]` : `[[${value.path}]]`
  }
  if (value.type === 'List') return value.items.map((item) => displayValue(item)).join('、')
  if (value.type === 'Error') return value.message
  return toDisplay(value)
}

export async function renderBase(root: string, text: string, basePath = ''): Promise<BaseDocument> {
  const parsed = parseBase(text)
  if (parsed.error) return { views: [], error: parsed.error }
  const base = parsed.base

  const listed = await readTree(root)
  const index = flatten(listed.tree).slice(0, MAX_FILES)

  const files = new Map<string, BaseFile>()
  const byStem = new Map<string, string>()
  const backlinkMap = new Map<string, string[]>()

  for (const entry of index) {
    const absolute = path.join(root, entry.path)
    const info = await stat(absolute).catch(() => undefined)
    let frontmatter: Record<string, unknown> | undefined
    const tags: string[] = []
    const links: Array<{ link: string; display: string }> = []
    const embeds: Array<{ link: string; display: string }> = []
    if (entry.ext === 'md' || entry.ext === 'markdown') {
      try {
        const raw = await readFile(absolute, 'utf8')
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
        if (match) {
          try {
            const yaml = parseYaml(match[1] ?? '')
            if (yaml && typeof yaml === 'object' && !Array.isArray(yaml)) frontmatter = yaml as Record<string, unknown>
          } catch {
            frontmatter = undefined
          }
        }
        const body = match ? raw.slice(match[0].length) : raw
        for (const found of body.matchAll(TAG)) tags.push(`#${found[2] ?? ''}`)
        for (const found of raw.matchAll(WIKI)) {
          const link = (found[2] ?? '').trim()
          if (!link) continue
          const entryLink = { link, display: found[3] || link }
          if (found[1] === '!') embeds.push(entryLink)
          else links.push(entryLink)
        }
      } catch {
        // An unreadable note still appears with file.* only.
      }
    }
    files.set(entry.path, {
      path: entry.path,
      ctime: info?.birthtimeMs ?? 0,
      mtime: info?.mtimeMs ?? 0,
      size: info?.size ?? 0,
      frontmatter,
      tags,
      links,
      embeds,
    })
    byStem.set(entry.stem, entry.path)
    for (const link of [...links, ...embeds]) {
      const list = backlinkMap.get(link.link) ?? []
      list.push(entry.path)
      backlinkMap.set(link.link, list)
    }
  }

  const resolve = (link: string, _from: string): string | null => {
    const clean = link.replace(/^\.\//, '')
    if (files.has(clean)) return clean
    if (files.has(`${clean}.md`)) return `${clean}.md`
    return byStem.get(clean.replace(/\.[^.]+$/, '')) ?? null
  }

  const host = {
    file: (target: string) => files.get(target) ?? null,
    resolve,
    backlinks: (target: string) => backlinkMap.get(target) ?? [],
  }

  const paths = [...files.keys()]
  const views: BaseView[] = []
  const notes: string[] = []
  if (listed.truncated) notes.push(`资料库文件太多，只检查了前 ${index.length} 个。`)

  for (const view of base.views) {
    const result = runQuery(base, view.name, {
      host,
      paths,
      now: Date.now(),
      thisPath: basePath || path.basename(root),
    })

    const order = Array.isArray(view.order) ? view.order.filter((item) => typeof item === 'string') : []
    const grouping = view.groupBy?.property
    const defaults = view.type === 'table' ? ['file.name'] : ['file.name', 'file.tags', 'file.mtime', 'file.backlinks']
    const columns = order.length > 0 ? order : defaults
    if (grouping && !columns.includes(grouping)) columns.push(grouping)

    const toRow = (row: (typeof result.rows)[number]): BaseRow => {
      const values: Record<string, string> = {}
      for (const column of columns) values[column] = displayValue(row.property(column))
      const file = files.get(row.path)
      const name = displayValue(row.property('file.name')) || (row.path.split('/').pop() ?? row.path)
      return {
        path: row.path,
        name,
        ext: file?.path.split('.').pop() ?? '',
        folder: displayValue(row.property('file.folder')),
        values,
      }
    }

    const groups: BaseGroup[] = result.groups.map((group) => ({
      key: group.key === null ? null : displayValue(group.key),
      rows: group.rows.map(toRow),
    }))
    const rows = result.rows.map(toRow)

    const summaries: Record<string, string> = {}
    for (const [property, value] of result.summaries) summaries[property] = displayValue(value)

    const viewNotes: string[] = []
    if (result.total > rows.length) viewNotes.push(`只显示 ${rows.length} 条，共 ${result.total} 条。`)
    if (result.errors.length > 0) viewNotes.push(`${result.errors.length} 行的筛选表达式出错，已跳过。`)
    if (view.type !== 'table' && !['cards', 'list', 'board', 'kanban', 'gallery'].includes(view.type)) {
      viewNotes.push(`「${view.type}」视图按列表显示。`)
    }

    views.push({
      name: view.name,
      type: view.type,
      columns,
      rows,
      groups,
      summaries,
      total: result.total,
      ...(viewNotes.length > 0 ? { note: viewNotes.join(' ') } : {}),
    })
  }

  if (notes.length > 0) {
    for (const view of views) view.note = [view.note, ...notes].filter(Boolean).join(' ')
  }
  return { views }
}
