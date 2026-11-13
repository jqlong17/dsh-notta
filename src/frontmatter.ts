/** Frontmatter parsing shared by the note reader and Bases. */
import { parse as parseYaml } from 'yaml'

export type PropertyKind = 'text' | 'list' | 'tags' | 'number' | 'checkbox' | 'date' | 'datetime' | 'link'

export interface NoteProperty {
  key: string
  kind: PropertyKind
  value: string
  items?: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const WIKILINK = /^\[\[[^\]]+\]\]$/

function propertyKind(key: string, value: unknown): PropertyKind {
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return key === 'tags' ? 'tags' : 'list'
  if (typeof value === 'string') {
    if (ISO_DATETIME.test(value)) return 'datetime'
    if (ISO_DATE.test(value)) return 'date'
    if (WIKILINK.test(value.trim())) return 'link'
  }
  return 'text'
}

export function propertyText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => propertyText(item)).filter(Boolean).join('、')
  return JSON.stringify(value)
}

export function splitFrontmatter(text: string): { properties: NoteProperty[]; body: string; raw: Record<string, unknown> } {
  const empty = { properties: [], body: text, raw: {} as Record<string, unknown> }
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return empty
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return empty
  let parsed: unknown
  try {
    parsed = parseYaml(match[1] ?? '')
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...empty, body: text.slice(match[0].length) }
  const raw = parsed as Record<string, unknown>
  const properties = Object.entries(raw).map(([key, value]) => ({
    key,
    kind: propertyKind(key, value),
    value: propertyText(value),
    ...(Array.isArray(value) ? { items: value.map((item) => propertyText(item)).filter(Boolean) } : {}),
  }))
  return { properties, body: text.slice(match[0].length), raw }
}
