/**
 * One pass over the vault: frontmatter, tags, links, embeds and the reverse
 * index. Bases and the backlink panel both read this instead of scanning twice.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'
import type { BaseFile } from '@type32/obsidian-bases-parser'

import { flatten, readTree } from './vault.ts'

export const MAX_GRAPH_FILES = 2000

const WIKI = /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const TAG = /(^|[\s(（])#([^\s#)\]】，。、]+)/g

export interface GraphLink {
  link: string
  display: string
}

export interface GraphNode extends BaseFile {
  name: string
  stem: string
  ext: string
  folder: string
  tags: string[]
  links: GraphLink[]
  embeds: GraphLink[]
}

export interface VaultGraph {
  nodes: Map<string, GraphNode>
  byStem: Map<string, string>
  /** Resolved target path → paths of the notes linking to it. */
  backlinks: Map<string, string[]>
  paths: string[]
  truncated: boolean
}

function basenameOf(relPath: string): string {
  return (relPath.split('/').pop() ?? relPath).replace(/\.[^.]+$/, '')
}

export async function buildGraph(root: string): Promise<VaultGraph> {
  const listed = await readTree(root)
  const index = flatten(listed.tree).slice(0, MAX_GRAPH_FILES)

  const nodes = new Map<string, GraphNode>()
  const byStem = new Map<string, string>()

  for (const entry of index) {
    const absolute = path.join(root, entry.path)
    const info = await stat(absolute).catch(() => undefined)
    let frontmatter: Record<string, unknown> | undefined
    const tags: string[] = []
    const links: GraphLink[] = []
    const embeds: GraphLink[] = []

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
          const record = { link, display: found[3] || link }
          if (found[1] === '!') embeds.push(record)
          else links.push(record)
        }
      } catch {
        // An unreadable note still appears with file.* only.
      }
    }

    nodes.set(entry.path, {
      path: entry.path,
      name: entry.ext === 'md' || entry.ext === 'markdown' ? entry.stem : (entry.path.split('/').pop() ?? entry.path),
      stem: entry.stem,
      ext: entry.ext,
      folder: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
      ctime: info?.birthtimeMs ?? 0,
      mtime: info?.mtimeMs ?? 0,
      size: info?.size ?? 0,
      frontmatter,
      tags,
      links,
      embeds,
    })
    byStem.set(entry.stem, entry.path)
  }

  const resolve = (link: string): string | null => {
    const clean = link.replace(/^\.\//, '')
    if (nodes.has(clean)) return clean
    if (nodes.has(`${clean}.md`)) return `${clean}.md`
    return byStem.get(clean.replace(/\.[^.]+$/, '')) ?? null
  }

  const backlinks = new Map<string, string[]>()
  for (const [source, node] of nodes) {
    for (const link of node.links) {
      const target = resolve(link.link)
      if (!target || target === source) continue
      const list = backlinks.get(target) ?? []
      list.push(source)
      backlinks.set(target, list)
    }
  }

  return { nodes, byStem, backlinks, paths: [...nodes.keys()], truncated: listed.truncated }
}

export function resolveLink(graph: VaultGraph, link: string): string | null {
  const clean = link.replace(/^\.\//, '')
  if (graph.nodes.has(clean)) return clean
  if (graph.nodes.has(`${clean}.md`)) return `${clean}.md`
  return graph.byStem.get(clean.replace(/\.[^.]+$/, '')) ?? null
}

export function displayNameOf(relPath: string): string {
  return basenameOf(relPath)
}
