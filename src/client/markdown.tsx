/**
 * Obsidian-flavored rendering: mdian supplies wikilinks, embeds, callouts,
 * highlights and comments; react-markdown supplies the React tree.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { rehypeOfm, remarkOfm } from 'mdian'

import { assetUrl, type BaseDocument, type NoteProperty, type RpcResult } from './rpc.ts'
import { BaseView } from './base-view.tsx'
import { rehypeVaultHtml } from './sanitize.ts'

export interface EmbedMap {
  [key: string]: { markdown: string; title: string; path: string }
}

export interface SearchHit {
  path: string
  title: string
  kind: string
  count: number
}

export interface FileMap {
  [key: string]: { path: string; kind: string; ext: string; base?: BaseDocument }
}

export interface MarkdownProps {
  markdown: string
  embeds?: EmbedMap
  files?: FileMap
  properties?: NoteProperty[]
  onOpenNote: (path: string, fragment?: string) => void
  rpc?: <T>(op: string, payload?: Record<string, unknown>) => Promise<RpcResult<T>>
  t?: (key: string) => string
  depth?: number
}

type HastNode = {
  properties?: Record<string, unknown>
}

/** hast keeps data attributes kebab-cased; accept either spelling. */
function prop(node: HastNode | undefined, ...names: string[]): string | undefined {
  const source = node?.properties
  if (!source) return undefined
  for (const name of names) {
    const candidates = [
      name,
      name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`),
      name.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase()),
    ]
    for (const key of candidates) {
      const value = source[key]
      if (typeof value === 'string' && value) return value
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0] as string
    }
  }
  return undefined
}

/** Presence check: boolean hast attributes carry an empty value. */
function hasProp(node: HastNode | undefined, ...names: string[]): boolean {
  const source = node?.properties
  if (!source) return false
  return names.some((name) => [
    name,
    name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`),
    name.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase()),
  ].some((key) => Object.hasOwn(source, key)))
}

const HIGHLIGHT_COLORS: Array<[string, string]> = [
  ['🔴', 'nt-hl-red'],
  ['🟠', 'nt-hl-orange'],
  ['🟡', 'nt-hl-yellow'],
  ['🟢', 'nt-hl-green'],
  ['🔵', 'nt-hl-blue'],
  ['🟣', 'nt-hl-purple'],
]

function splitHighlight(text: string): { text: string; className?: string } {
  for (const [emoji, className] of HIGHLIGHT_COLORS) {
    if (text.startsWith(emoji)) return { text: text.slice(emoji.length), className }
  }
  return { text }
}

function icon(paths: string[]) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.35"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

const CALLOUT_ICONS: Record<string, JSX.Element> = {
  note: icon(['M11.2 2.8 13.2 4.8 5.6 12.4 2.8 13.2 3.6 10.4z']),
  abstract: icon(['M4 2.5h8v11H4z', 'M6 6h4M6 8.6h4M6 11.2h2.4']),
  info: icon(['M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9z', 'M8 7.2v4', 'M8 4.9v.1']),
  todo: icon(['M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9z', 'M5.4 8.1 7.2 10 10.7 6.3']),
  tip: icon(['M8 1.8a4.4 4.4 0 0 0-2.7 7.9v1.4h5.4v-1.4A4.4 4.4 0 0 0 8 1.8z', 'M6.4 13.1h3.2']),
  success: icon(['M2.4 8.4 6 12 13.4 4.4']),
  question: icon(['M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9z', 'M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4', 'M8 11.5v.1']),
  warning: icon(['M8 2.1 14.2 13H1.8z', 'M8 6.1v3.4', 'M8 11.2v.1']),
  failure: icon(['M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9z', 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4']),
  danger: icon(['M8.6 1.8 13.4 13H3.4z', 'M8.2 5.6l-.5 4h1.6l-.5-4z', 'M8.2 11.4v.1']),
  bug: icon(['M8 4.2a4 4 0 0 0-4 4c0 2.7 1.7 4.6 4 4.6s4-1.9 4-4.6a4 4 0 0 0-4-4z', 'M8 4.2V2.6', 'M4.2 6.6 2.6 5.8M11.8 6.6l1.6-.8', 'M4 9.6H2.4M12 9.6h1.6']),
  example: icon(['M6.2 2.4h3.6v3.2l3.2 5.6a1.6 1.6 0 0 1-1.4 2.4H4.4a1.6 1.6 0 0 1-1.4-2.4l3.2-5.6z', 'M5.4 9.6h5.2']),
  quote: icon(['M5.4 4.6C3.9 5.4 3 6.6 3 8.2c0 1.9 1.1 3.2 2.6 3.2 1.2 0 2-0.8 2-1.9 0-1-.7-1.8-1.7-1.8-.2 0-.4 0-.5.1.2-.9.8-1.6 1.6-2.1z', 'M11.6 4.6c-1.5.8-2.4 2-2.4 3.6 0 1.9 1.1 3.2 2.6 3.2 1.2 0 2-.8 2-1.9 0-1-.7-1.8-1.7-1.8-.2 0-.4 0-.5.1.2-.9.8-1.6 1.6-2.1z']),
}

const CALLOUT_ALIAS: Record<string, string> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

const CALLOUT_COLORS: Record<string, string> = {
  note: 'var(--dsw-alias-label-secondary)',
  abstract: 'var(--dsw-alias-brand-primary)',
  info: 'var(--dsw-alias-brand-primary)',
  todo: 'var(--dsw-alias-brand-primary)',
  tip: 'var(--dsw-alias-state-success-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  question: 'var(--dsw-alias-state-warn-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  failure: 'var(--dsw-alias-state-error-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  bug: 'var(--dsw-alias-state-error-primary)',
  example: 'var(--dsw-alias-brand-primary)',
  quote: 'var(--dsw-alias-label-tertiary)',
}

function calloutKey(type: string | undefined): string {
  const raw = (type ?? 'note').toLowerCase()
  return CALLOUT_ALIAS[raw] ?? (CALLOUT_ICONS[raw] ? raw : 'note')
}

function Callout({ type, foldable, collapsed, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) {
  const [isCollapsed, setCollapsed] = useState(Boolean(collapsed))
  const key = calloutKey(type as string | undefined)
  const color = CALLOUT_COLORS[key] ?? CALLOUT_COLORS.note
  const glyph = CALLOUT_ICONS[key] ?? CALLOUT_ICONS.note

  // mdian emits the title and body as two children; put the icon and the fold
  // caret inside the title row so the header reads like Obsidian's.
  const kids = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child
    const className = String((child.props as { className?: string }).className ?? '')
    if (!className.includes('ofm-callout-title')) return child
    const inner = (child.props as { children?: React.ReactNode }).children
    return React.cloneElement(child as React.ReactElement, { className: `${className} nt-callout-title` }, (
      <>
        <span className="nt-callout-icon">{glyph}</span>
        <span className="nt-callout-title-text">{inner}</span>
        {foldable
          ? <span className="nt-fold" aria-hidden="true">{isCollapsed ? '›' : '⌄'}</span>
          : null}
      </>
    ))
  })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      className={`nt-callout${isCollapsed ? ' is-collapsed' : ''}`}
      data-ofm-kind="callout"
      style={{ ['--nt-callout-color' as string]: color }}
      onClick={(event) => {
        if (!foldable) return
        const target = event.target as HTMLElement
        if (target.closest('.ofm-callout-title')) setCollapsed((value) => !value)
      }}
    >
      {kids}
    </div>
  )
}

/** Foldable callouts arrive as <details>/<summary>; keep the native toggle. */
function FoldableCallout({ type, collapsed, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement | null>(null)
  const key = calloutKey(type as string | undefined)
  const color = CALLOUT_COLORS[key] ?? CALLOUT_COLORS.note
  const glyph = CALLOUT_ICONS[key] ?? CALLOUT_ICONS.note
  useEffect(() => {
    if (ref.current) ref.current.open = !collapsed
  }, [collapsed])
  const kids = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child
    const className = String((child.props as { className?: string }).className ?? '')
    if (!className.includes('ofm-callout-title')) return child
    const inner = (child.props as { children?: React.ReactNode }).children
    return React.cloneElement(child as React.ReactElement, { className: `${className} nt-callout-title` }, (
      <>
        <span className="nt-callout-icon">{glyph}</span>
        <span className="nt-callout-title-text">{inner}</span>
        <span className="nt-fold" aria-hidden="true">›</span>
      </>
    ))
  })
  return (
    <details
      {...(rest as Record<string, unknown>)}
      ref={ref}
      className="nt-callout"
      data-ofm-kind="callout"
      style={{ ['--nt-callout-color' as string]: color }}
    >
      {kids}
    </details>
  )
}

const PROP_ICONS: Record<string, string[]> = {
  aliases: ['M6.6 9.4 9.4 6.6a2 2 0 0 0 0-2.8 2 2 0 0 0-2.8 0L4.8 5.6', 'M9.4 6.6 6.6 9.4a2 2 0 0 0 2.8 2.8l1.8-1.8'],
  tags: ['M8.4 2.2H13v4.6l-6.2 6.2a1.3 1.3 0 0 1-1.9 0L2.4 10a1.3 1.3 0 0 1 0-1.9z', 'M10.7 4.9v.1'],
  list: ['M5.4 4h8M5.4 8h8M5.4 12h8', 'M2.6 4h.1M2.6 8h.1M2.6 12h.1'],
  date: ['M2.8 4.2h10.4v9H2.8z', 'M2.8 7.2h10.4', 'M5.6 2.6v2.4M10.4 2.6v2.4'],
  datetime: ['M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9z', 'M8 4.8V8l2.2 1.4'],
  number: ['M6.2 2.6 4.8 13.4M11.2 2.6 9.8 13.4', 'M2.6 6.2h11M2 9.8h11'],
  checkbox: ['M2.8 3.2h10.4v9.6H2.8z', 'M5.4 8 7.2 9.8 10.8 5.8'],
  link: ['M6.6 9.4 9.4 6.6a2 2 0 0 0 0-2.8 2 2 0 0 0-2.8 0L4.8 5.6'],
  text: ['M3.4 4.6h9.2M3.4 8h9.2M3.4 11.4h5.6'],
}

function propertyIcon(item: NoteProperty) {
  const paths = PROP_ICONS[item.key]
    ?? (item.kind === 'date' ? PROP_ICONS.date
      : item.kind === 'datetime' ? PROP_ICONS.datetime
        : item.kind === 'number' ? PROP_ICONS.number
          : item.kind === 'checkbox' ? PROP_ICONS.checkbox
            : item.kind === 'link' ? PROP_ICONS.link
              : item.kind === 'list' || item.kind === 'tags' ? PROP_ICONS.list
                : PROP_ICONS.text)
  return icon(paths)
}

function parseFragment(fragment: string | undefined): { page?: string; height?: number } {
  if (!fragment) return {}
  const out: { page?: string; height?: number } = {}
  for (const part of fragment.split('&')) {
    const [rawKey, rawValue] = part.split('=')
    const key = (rawKey ?? '').trim().replace(/^#/, '')
    const value = (rawValue ?? '').trim()
    if (!value) continue
    if (key === 'page') out.page = value
    if (key === 'height') {
      const height = Number.parseInt(value, 10)
      if (Number.isFinite(height) && height > 0) out.height = height
    }
  }
  return out
}

const PDFJS_SRC = '/dsh-notta/vendor/pdf.min.mjs'
const PDFJS_WORKER = '/dsh-notta/vendor/pdf.worker.min.mjs'
const PDF_DEFAULT_HEIGHT = 420

interface PdfPageProxy {
  getViewport(options: { scale: number }): { width: number; height: number }
  render(options: Record<string, unknown>): { promise: Promise<void>; cancel(): void }
}

interface PdfDocument {
  numPages: number
  getPage(index: number): Promise<PdfPageProxy>
  destroy(): Promise<void>
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(options: { url: string }): { promise: Promise<PdfDocument>; destroy(): Promise<void> }
}

let pdfjsPromise: Promise<PdfJsModule> | undefined

function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = (async () => {
    const specifier = PDFJS_SRC
    const module = await import(/* keep external: vendored at runtime */ specifier) as PdfJsModule
    module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    return module
  })()
  return pdfjsPromise
}

/** PDF embed: render the page onto a canvas so the frame matches the theme. */
function PdfEmbed({ path: rel, fragment, title }: { path: string; fragment?: string; title: string }) {
  const { page, height } = parseFragment(fragment)
  const frameHeight = height ?? PDF_DEFAULT_HEIGHT
  const initialPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
  const stage = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const task = useRef<{ cancel(): void } | undefined>(undefined)
  const docRef = useRef<PdfDocument | undefined>(undefined)
  const [pages, setPages] = useState(0)
  const [pageNo, setPageNo] = useState(initialPage)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState<'width' | 'height'>('width')
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [scalePct, setScalePct] = useState(100)
  const [failed, setFailed] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const pdfjs = await loadPdfJs()
        const doc = await pdfjs.getDocument({ url: assetUrl(rel) }).promise
        if (cancelled) {
          void doc.destroy()
          return
        }
        docRef.current = doc
        setPages(doc.numPages)
        setPageNo((value) => Math.min(Math.max(1, value), doc.numPages))
      } catch (error) {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
      task.current?.cancel()
      void docRef.current?.destroy()
      docRef.current = undefined
    }
  }, [rel])

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const measure = () => setStageSize({ width: host.clientWidth, height: host.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [failed])

  useEffect(() => {
    const doc = docRef.current
    const target = canvas.current
    const host = stage.current
    if (!doc || !target || !host || stageSize.width <= 0 || stageSize.height <= 0) return
    let cancelled = false
    void (async () => {
      try {
        const pdfPage = await doc.getPage(pageNo)
        if (cancelled) return
        const base = pdfPage.getViewport({ scale: 1 })
        // Fit the page to the stage by width or by height, then apply the zoom.
        const fit = fitMode === 'height'
          ? Math.max(0.1, (stageSize.height - 24) / base.height)
          : Math.max(0.1, (stageSize.width - 24) / base.width)
        const effective = fit * zoom
        const viewport = pdfPage.getViewport({ scale: effective })
        const ratio = window.devicePixelRatio || 1
        target.width = Math.floor(viewport.width * ratio)
        target.height = Math.floor(viewport.height * ratio)
        target.style.width = `${Math.floor(viewport.width)}px`
        target.style.height = `${Math.floor(viewport.height)}px`
        const context = target.getContext('2d')
        if (!context) return
        task.current?.cancel()
        const renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        task.current = renderTask
        setScalePct(Math.round(effective * 100))
        await renderTask.promise
      } catch (error) {
        const name = (error as { name?: string })?.name
        if (name === 'RenderingCancelledException' || cancelled) return
        setFailed(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pageNo, zoom, fitMode, stageSize.width, stageSize.height, pages])

  if (failed) {
    // Keep a usable fallback: the browser's own viewer.
    return (
      <iframe className="nt-pdf-embed" src={`${assetUrl(rel)}${page ? `#page=${page}` : ''}`} title={title}
        style={{ height: frameHeight }} />
    )
  }

  return (
    <div className="nt-pdf-frame" style={{ height: frameHeight }} data-ofm-pdf={rel}>
      <div className="nt-pdf-bar">
        <button type="button" className="nt-pdf-btn" onClick={() => setPageNo((n) => Math.max(1, n - 1))} disabled={pageNo <= 1} aria-label="上一页">‹</button>
        <span className="nt-pdf-page">{pageNo}{pages > 0 ? ` / ${pages}` : ''}</span>
        <button type="button" className="nt-pdf-btn" onClick={() => setPageNo((n) => Math.min(pages || n, n + 1))} disabled={pages > 0 && pageNo >= pages} aria-label="下一页">›</button>
        <span className="nt-pdf-sep" />
        <button type="button" className="nt-pdf-btn" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))} aria-label="缩小">−</button>
        <span className="nt-pdf-zoom">{scalePct}%</span>
        <button type="button" className="nt-pdf-btn" onClick={() => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))} aria-label="放大">+</button>
        <button
          type="button"
          className={`nt-pdf-btn is-text nt-pdf-fit${fitMode === 'width' ? ' is-on' : ''}`}
          aria-pressed={fitMode === 'width'}
          onClick={() => { setFitMode('width'); setZoom(1) }}
        >适应宽度</button>
        <button
          type="button"
          className={`nt-pdf-btn is-text nt-pdf-fit${fitMode === 'height' ? ' is-on' : ''}`}
          aria-pressed={fitMode === 'height'}
          onClick={() => { setFitMode('height'); setZoom(1) }}
        >适应高度</button>
        <span className="nt-pdf-grow" />
        <a className="nt-pdf-btn is-text" href={assetUrl(rel)} target="_blank" rel="noreferrer noopener">在新标签打开</a>
      </div>
      <div className="nt-pdf-stage" ref={stage}>
        <canvas ref={canvas} className="nt-pdf-canvas" />
      </div>
    </div>
  )
}

function AudioEmbed({ path: rel, title }: { path: string; title: string }) {
  return <audio className="nt-audio" controls preload="metadata" src={assetUrl(rel)} title={title} />
}

function VideoEmbed({ path: rel, title }: { path: string; title: string }) {
  return <video className="nt-video" controls preload="metadata" src={assetUrl(rel)} title={title} />
}

function FileChip({ path: rel, title }: { path: string; title: string }) {
  return (
    <span className="nt-file-chip" title={rel}>
      {title}
      <span className="nt-file-ext">{rel.split('.').pop()}</span>
    </span>
  )
}

const WIKI_INLINE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function PropertyValue({ item, onOpenNote }: { item: NoteProperty; onOpenNote: MarkdownProps['onOpenNote'] }) {
  if (item.kind === 'checkbox') {
    return (
      <span className={`nt-check${item.value === 'true' ? ' is-on' : ''}`} aria-label={item.value}>
        {item.value === 'true' ? '✓' : ''}
      </span>
    )
  }
  if (item.kind === 'tags' || item.kind === 'list') {
    const items = item.items ?? (item.value ? item.value.split('、') : [])
    return (
      <span className="nt-chips">
        {items.map((entry) => <span className="nt-chip" key={entry}>{entry}</span>)}
      </span>
    )
  }
  if (item.kind === 'link' || item.value.includes('[[')) {
    const parts: React.ReactNode[] = []
    let last = 0
    for (const match of item.value.matchAll(WIKI_INLINE)) {
      const index = match.index ?? 0
      if (index > last) parts.push(item.value.slice(last, index))
      const target = match[1] ?? ''
      const label = match[2] ?? target
      parts.push(
        <a
          key={`${target}-${index}`}
          href="#"
          role="link"
          tabIndex={0}
          className="ofm-wikilink"
          onClick={(event) => {
            event.preventDefault()
            onOpenNote(target)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpenNote(target)
          }}
        >
          {label}
        </a>,
      )
      last = index + match[0].length
    }
    if (last < item.value.length) parts.push(item.value.slice(last))
    return <span>{parts}</span>
  }
  return <span>{item.value}</span>
}

function Properties({ items, onOpenNote, title }: {
  items: NoteProperty[]
  onOpenNote: MarkdownProps['onOpenNote']
  title: string
}) {
  return (
    <div className="nt-props">
      <div className="nt-props-title">{title}</div>
      {items.map((item) => (
        <div className="nt-prop" key={item.key}>
          <span className="nt-prop-icon">{propertyIcon(item)}</span>
          <span className="nt-prop-key">{item.key}</span>
          <span className="nt-prop-value"><PropertyValue item={item} onOpenNote={onOpenNote} /></span>
        </div>
      ))}
    </div>
  )
}

/** Vault image: resolve by index, fall back to a readable placeholder. */
function VaultImage({ path: rel, alt, width, title }: {
  path: string
  alt?: string
  width?: number | string
  title?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!rel) return <span className="nt-img-missing">图片路径为空</span>
  if (failed) {
    return <span className="nt-img-missing" title={rel}>{alt || rel}</span>
  }
  return (
    <img
      className="nt-image"
      src={assetUrl(rel)}
      alt={alt ?? ''}
      title={title ?? rel}
      {...(width ? { width } : {})}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

let mermaidSeq = 0
const MERMAID_SRC = '/dsh-notta/vendor/mermaid.min.js'

interface MermaidApi {
  initialize(options: Record<string, unknown>): void
  render(id: string, code: string): Promise<{ svg: string }>
}

let mermaidPromise: Promise<MermaidApi> | undefined

function mermaidTheme(): string {
  if (typeof window === 'undefined') return 'neutral'
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    || document.documentElement.dataset.theme === 'dark'
  return dark ? 'dark' : 'neutral'
}

/** Load Mermaid from the plugin's own vendor route on first diagram. */
function loadMermaid(): Promise<MermaidApi> {
  if (mermaidPromise) return mermaidPromise
  mermaidPromise = new Promise<MermaidApi>((resolve, reject) => {
    const ready = (window as unknown as { mermaid?: MermaidApi }).mermaid
    if (ready) {
      ready.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mermaidTheme() })
      resolve(ready)
      return
    }
    const script = document.createElement('script')
    script.src = MERMAID_SRC
    script.async = true
    script.dataset.dhsNotta = 'mermaid'
    script.onload = () => {
      const loaded = (window as unknown as { mermaid?: MermaidApi }).mermaid
      if (!loaded) {
        reject(new Error('Mermaid 脚本没有注册全局对象'))
        return
      }
      loaded.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mermaidTheme() })
      resolve(loaded)
    }
    script.onerror = () => reject(new Error(`无法加载 ${MERMAID_SRC}`))
    document.head.appendChild(script)
  })
  return mermaidPromise
}

function MermaidBlock({ code }: { code: string }) {
  const host = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    let cancelled = false
    const id = `nt-mermaid-${++mermaidSeq}`
    void loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((outcome) => {
        if (cancelled || !host.current) return
        host.current.innerHTML = outcome.svg
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      cancelled = true
    }
  }, [code])
  if (error) {
    return (
      <div className="nt-mermaid">
        <pre><code>{code}</code></pre>
        <div className="nt-state-code">Mermaid 渲染失败：{error}</div>
      </div>
    )
  }
  return <div className="nt-mermaid" ref={host} />
}

const SEARCH_ICON = icon(['M7.1 2.4a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4z', 'M10.6 10.6 13.6 13.6'])

function QueryEmbed({ query, rpc, onOpenNote, t }: {
  query: string
  rpc?: MarkdownProps['rpc']
  onOpenNote: MarkdownProps['onOpenNote']
  t?: MarkdownProps['t']
}) {
  const [hits, setHits] = useState<SearchHit[] | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    if (!rpc) return
    let cancelled = false
    setHits(undefined)
    setError(undefined)
    void rpc<{ query: string; hits: SearchHit[] }>('search', { query }).then((result) => {
      if (cancelled) return
      if (result.ok) setHits(result.value.hits)
      else setError(result.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [query, rpc])

  return (
    <div className="nt-query">
      <div className="nt-query-head">
        <span className="nt-query-icon">{SEARCH_ICON}</span>
        <code>{query}</code>
      </div>
      {error ? <div className="nt-query-state">{t?.('query.failed') ?? '搜索失败'}{error}</div> : null}
      {!error && hits && hits.length === 0 ? <div className="nt-query-state">{t?.('query.empty') ?? '没有匹配的笔记。'}</div> : null}
      {hits && hits.length > 0 ? (
        <div className="nt-query-list">
          {hits.map((hit) => (
            <button type="button" className="nt-query-row" key={hit.path} onClick={() => onOpenNote(hit.path)} title={hit.path}>
              <span className="nt-query-path">{hit.path}</span>
              <span className="nt-query-count">{hit.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MarkdownView({ markdown, embeds, files, properties, onOpenNote, rpc, t, depth = 0 }: MarkdownProps) {
  const components = useMemo(() => {
    const open = (rawPath: string | undefined, fragment: string | undefined) => {
      if (!rawPath) return
      onOpenNote(rawPath, fragment)
    }
    return {
      a({ node, children, href, ...rest }: Record<string, unknown> & { node?: HastNode; children?: React.ReactNode; href?: string }) {
        const kind = prop(node, 'dataOfmKind')
        const variant = prop(node, 'dataOfmVariant')
        const target = prop(node, 'dataOfmPath')
        const fragment = prop(node, 'dataOfmFragment')
        if (kind === 'embed' && variant === 'file') {
          const resolved = files?.[target ?? '']
          if (resolved?.base) {
            return (
              <BaseView
                doc={resolved.base}
                embedded
                onOpenNote={onOpenNote}
                onAddView={async () => {}}
                onRenameView={async () => {}}
                onDeleteView={async () => {}}
                onSetLayout={async () => {}}
                onSetFilter={async () => {}}
                onMoveView={async () => 0}
                t={t ?? ((key: string) => key)}
              />
            )
          }
          if (resolved) {
            if (resolved.kind === 'pdf') return <PdfEmbed path={resolved.path} fragment={fragment} title={target ?? resolved.path} />
            if (resolved.kind === 'audio') return <AudioEmbed path={resolved.path} title={target ?? resolved.path} />
            if (resolved.kind === 'video') return <VideoEmbed path={resolved.path} title={target ?? resolved.path} />
            if (resolved.kind === 'image') return <VaultImage path={resolved.path} alt={target} />
            return <FileChip path={resolved.path} title={target ?? resolved.path} />
          }
          return <FileChip path={target ?? ''} title={target ?? ''} />
        }
        if (kind === 'wikilink') {
          return (
            <a
              {...(rest as Record<string, unknown>)}
              href={href}
              className="ofm-wikilink"
              role="link"
              tabIndex={0}
              onClick={(event) => {
                event.preventDefault()
                open(target, fragment)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                open(target, fragment)
              }}
            >
              {children}
            </a>
          )
        }
        return <a {...(rest as Record<string, unknown>)} href={href} target="_blank" rel="noreferrer noopener">{children}</a>
      },
      div({ node, children, ...rest }: Record<string, unknown> & { node?: HastNode; children?: React.ReactNode }) {
        const kind = prop(node, 'dataOfmKind')
        if (kind === 'callout') {
          return (
            <Callout
              {...(rest as Record<string, unknown>)}
              type={prop(node, 'dataOfmCallout')}
              foldable={hasProp(node, 'dataOfmFoldable')}
              collapsed={hasProp(node, 'dataOfmCollapsed')}
              node={node}
            >
              {children}
            </Callout>
          )
        }
        if (kind === 'embed' && prop(node, 'dataOfmVariant') === 'note') {
          const target = prop(node, 'dataOfmPath') ?? ''
          const resolved = embeds?.[target]
          return (
            <div {...(rest as Record<string, unknown>)} className="nt-embed" data-ofm-kind="embed">
              <div className="nt-embed-head">
                <span>嵌入</span>
                <span
                  className="nt-embed-link"
                  role="link"
                  tabIndex={0}
                  style={{ color: 'var(--dsw-alias-link)', cursor: 'pointer' }}
                  onClick={() => open(resolved?.path ?? target, undefined)}
                >
                  {resolved?.title ?? target}
                </span>
              </div>
              {resolved && depth < 2
                ? <MarkdownView markdown={resolved.markdown} embeds={embeds} files={files} onOpenNote={onOpenNote} rpc={rpc} t={t} depth={depth + 1} />
                : <div className="nt-embed-missing">{resolved ? '嵌套太深，只展开两层。' : '这个嵌入的笔记不在资料库里。'}</div>}
            </div>
          )
        }
        return <div {...(rest as Record<string, unknown>)}>{children}</div>
      },
      details({ node, children, ...rest }: Record<string, unknown> & { node?: HastNode; children?: React.ReactNode }) {
        if (prop(node, 'dataOfmKind') !== 'callout') {
          return <details {...(rest as Record<string, unknown>)}>{children}</details>
        }
        return (
          <FoldableCallout
            {...(rest as Record<string, unknown>)}
            type={prop(node, 'dataOfmCallout')}
            collapsed={hasProp(node, 'dataOfmCollapsed')}
          >
            {children}
          </FoldableCallout>
        )
      },
      mark({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) {
        const items = React.Children.toArray(children)
        const first = typeof items[0] === 'string' ? splitHighlight(items[0]) : { text: '', className: undefined }
        const restItems = first.className ? items.slice(1) : items
        const text = first.className ? first.text : (items[0] as string | undefined)
        return (
          <mark {...(rest as Record<string, unknown>)} className={`ofm-highlight${first.className ? ` ${first.className}` : ''}`}>
            {first.className ? text : null}
            {first.className ? restItems : items}
          </mark>
        )
      },
      code({ node, className, children, ...rest }: Record<string, unknown> & { node?: HastNode; className?: string; children?: React.ReactNode }) {
        const language = /language-([\w-]+)/.exec(String(className ?? ''))?.[1]
        if (language === 'mermaid') return <MermaidBlock code={String(children ?? '').replace(/\n$/, '')} />
        if (language === 'query') {
          return <QueryEmbed query={String(children ?? '').trim()} rpc={rpc} onOpenNote={onOpenNote} t={t} />
        }
        return <code {...(rest as Record<string, unknown>)} className={className}>{children}</code>
      },
      img({ node, src, alt, width, title }: Record<string, unknown> & { node?: HastNode; src?: string; alt?: string; width?: number | string; title?: string }) {
        const raw = src ?? ''
        if (/^(https?:|data:|blob:)/i.test(raw)) {
          return <img className="nt-image" src={raw} alt={alt ?? ''} title={title} {...(width ? { width } : {})} loading="lazy" />
        }
        const target = prop(node, 'dataOfmPath') ?? raw
        const resolved = files?.[target]?.path
          ?? files?.[raw]?.path
          ?? (target.startsWith('/') ? target : target)
        return <VaultImage path={resolved} alt={alt} width={width} title={title} />
      },
    }
  }, [embeds, files, onOpenNote, rpc, t, depth])

  return (
    <div className="nt-doc">
      {properties && properties.length > 0
        ? <Properties items={properties} onOpenNote={onOpenNote} title={t?.('props.title') ?? '笔记属性'} />
        : null}
      <ReactMarkdown
        remarkPlugins={[remarkOfm, remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeOfm, { resolveHref: (href: string) => href, resolveResourceUrl: (url: string) => url }],
          rehypeRaw,
          rehypeVaultHtml,
          rehypeKatex,
        ]}
        components={components as never}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
