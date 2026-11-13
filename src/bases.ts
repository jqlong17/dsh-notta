/**
 * Bases: Obsidian's `.base` files are saved view definitions over the vault.
 * The query engine is `@type32/obsidian-bases-parser` (MIT), which reproduces
 * Obsidian 1.15's filters, formulas, sort, groups and summaries; this module
 * only feeds it the vault index and shapes the result for the panel.
 */
import path from 'node:path'

import { parseBase, runQuery, toDisplay, type Value } from '@type32/obsidian-bases-parser'

import { buildGraph, resolveLink } from './graph.ts'

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

  const graph = await buildGraph(root)
  const host = {
    file: (target: string) => graph.nodes.get(target) ?? null,
    resolve: (link: string, _from: string) => resolveLink(graph, link),
    backlinks: (target: string) => graph.backlinks.get(target) ?? [],
  }

  const paths = graph.paths
  const views: BaseView[] = []
  const notes: string[] = []
  if (graph.truncated) notes.push(`资料库文件太多，只检查了前 ${graph.paths.length} 个。`)

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
      const file = graph.nodes.get(row.path)
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
