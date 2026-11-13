/** Read-only note views plus Bases editing: layout, rename, filter, order. */
import React, { useEffect, useState } from 'react'

import type { BaseDocument, BaseRow } from './rpc.ts'

interface BaseViewProps {
  doc: BaseDocument
  onOpenNote: (path: string) => void
  onAddView: () => Promise<void>
  onRenameView: (view: string, to: string) => Promise<void>
  onDeleteView: (view: string) => Promise<void>
  onSetLayout: (view: string, type: string) => Promise<void>
  onSetFilter: (view: string, expression: string) => Promise<void>
  onMoveView: (view: string, index: number) => Promise<number>
  t: (key: string) => string
  /** Embedded in a note: read-only, no tabs menu or edit actions. */
  embedded?: boolean
}

const LABELS: Record<string, string> = {
  'file.name': '名称',
  'file.path': '路径',
  'file.ext': '扩展名',
  'file.folder': '文件夹',
  'file.basename': '完整文件名',
  'file.link': '文件链接',
  'file.tags': '文件标签',
  'file.links': '文件链接数',
  'file.backlinks': '文件反向链接',
  'file.embeds': '文件嵌入',
  'file.ctime': '创建时间',
  'file.mtime': '修改时间',
  'file.size': '文件大小',
}

const LAYOUTS: Array<{ type: string; label: string }> = [
  { type: 'table', label: '表格' },
  { type: 'cards', label: '卡片' },
  { type: 'list', label: '列表' },
  { type: 'kanban', label: '看板' },
]

function columnLabel(key: string): string {
  return LABELS[key] ?? key.replace(/^(note|formula)\./, '')
}

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function Cell({ value, onOpenNote }: { value: string; onOpenNote: (path: string) => void }) {
  if (!value) return <span className="nt-base-empty">—</span>
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const match of value.matchAll(WIKI)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(value.slice(last, index))
    const target = match[1] ?? ''
    const label = match[2] ?? target
    nodes.push(
      <a
        key={`${target}-${index}`}
        href="#"
        className="ofm-wikilink"
        role="link"
        tabIndex={0}
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
  if (last < value.length) nodes.push(value.slice(last))
  return <>{nodes}</>
}

function rowName(row: BaseRow): string {
  return row.values['file.name'] || row.name
}

function TableView({ view, onOpenNote }: { view: BaseDocument['views'][number]; onOpenNote: (path: string) => void }) {
  const summaryKeys = Object.keys(view.summaries)
  return (
    <table className="nt-base-table">
      <thead>
        <tr>{view.columns.map((key) => <th key={key}>{columnLabel(key)}</th>)}</tr>
      </thead>
      <tbody>
        {view.rows.map((row) => (
          <tr key={row.path}>
            {view.columns.map((key, index) => (
              <td key={key}>
                {index === 0
                  ? (
                    <a
                      href="#"
                      className="ofm-wikilink"
                      role="link"
                      tabIndex={0}
                      onClick={(event) => {
                        event.preventDefault()
                        onOpenNote(row.path)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        onOpenNote(row.path)
                      }}
                    >
                      {rowName(row)}
                    </a>
                  )
                  : <Cell value={row.values[key] ?? ''} onOpenNote={onOpenNote} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {summaryKeys.length > 0
        ? (
          <tfoot>
            <tr>
              {view.columns.map((key, index) => (
                <td key={key}>{index === 0 ? '汇总' : summaryKeys.includes(key) ? view.summaries[key] : ''}</td>
              ))}
            </tr>
          </tfoot>
        )
        : null}
    </table>
  )
}

function Card({ row, columns, onOpenNote }: {
  row: BaseRow
  columns: string[]
  onOpenNote: (path: string) => void
}) {
  const rest = columns.filter((key) => key !== 'file.name')
  return (
    <div className="nt-base-card">
      <button type="button" className="nt-base-card-title" onClick={() => onOpenNote(row.path)}>{rowName(row)}</button>
      {rest.map((key) => (
        <div className="nt-base-card-row" key={key}>
          <span className="nt-base-card-key">{columnLabel(key)}</span>
          <span className="nt-base-card-value"><Cell value={row.values[key] ?? ''} onOpenNote={onOpenNote} /></span>
        </div>
      ))}
    </div>
  )
}

function CardsView({ view, onOpenNote }: { view: BaseDocument['views'][number]; onOpenNote: (path: string) => void }) {
  return (
    <div className="nt-base-cards">
      {view.rows.map((row) => <Card key={row.path} row={row} columns={view.columns} onOpenNote={onOpenNote} />)}
    </div>
  )
}

function ListView({ view, onOpenNote }: { view: BaseDocument['views'][number]; onOpenNote: (path: string) => void }) {
  const rest = view.columns.filter((key) => key !== 'file.name')
  return (
    <div className="nt-base-list">
      {view.rows.map((row) => (
        <div className="nt-base-list-row" key={row.path}>
          <button type="button" className="nt-base-card-title" onClick={() => onOpenNote(row.path)}>{rowName(row)}</button>
          <span className="nt-base-chips">
            {rest.map((key) => (row.values[key]
              ? <span className="nt-chip" key={key}><span className="nt-chip-key">{columnLabel(key)}</span> {row.values[key]}</span>
              : null))}
          </span>
        </div>
      ))}
    </div>
  )
}

function BoardView({ view, onOpenNote }: { view: BaseDocument['views'][number]; onOpenNote: (path: string) => void }) {
  const groups = view.groups.length > 1 ? view.groups : [{ key: null, rows: view.rows }]
  return (
    <div className="nt-base-board">
      {groups.map((group, index) => (
        <div className="nt-base-column" key={`${group.key ?? 'none'}-${index}`}>
          <div className="nt-base-column-head">
            <span>{group.key ?? '未分组'}</span>
            <span className="nt-base-column-count">{group.rows.length}</span>
          </div>
          {group.rows.map((row) => (
            <Card key={row.path} row={row} columns={view.columns} onOpenNote={onOpenNote} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function BaseView({
  doc, onOpenNote, onAddView, onRenameView, onDeleteView, onSetLayout, onSetFilter, onMoveView, t, embedded = false,
}: BaseViewProps) {
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftFilter, setDraftFilter] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const view = doc.views[active] ?? doc.views[0]

  useEffect(() => {
    setDraftName(view?.name ?? '')
    setConfirmDelete(false)
  }, [view?.name, menuOpen])

  useEffect(() => {
    if (active >= doc.views.length) setActive(0)
  }, [active, doc.views.length])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await task()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  if (doc.error) {
    return (
      <div className="nt-doc">
        <div className="nt-state">
          <strong>{t('base.error')}</strong>
          <div>{doc.error}</div>
        </div>
      </div>
    )
  }
  if (!view) {
    return (
      <div className="nt-doc">
        <div className="nt-state">{t('base.empty')}</div>
      </div>
    )
  }

  const layout = view.type === 'board' || view.type === 'kanban'
    ? 'board'
    : view.type === 'cards' || view.type === 'gallery'
      ? 'cards'
      : view.type === 'list'
        ? 'list'
        : 'table'

  return (
    <div className="nt-doc">
      <div className="nt-base-tabs" role="tablist">
        {doc.views.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            type="button"
            role="tab"
            draggable
            aria-selected={index === active}
            className={`nt-base-tab${index === active ? ' is-on' : ''}`}
            title={t('base.dragHint')}
            onClick={() => setActive(index)}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', String(index))
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const from = Number(event.dataTransfer.getData('text/plain'))
              if (!Number.isInteger(from) || from === index) return
              void run(async () => {
                const target = await onMoveView(item.name, index)
                setActive(target)
              })
            }}
          >
            {item.name}
          </button>
        ))}
        {embedded ? null : <button
          type="button"
          className={`nt-base-menu${menuOpen ? ' is-on' : ''}`}
          title={t('base.viewSettings')}
          aria-label={t('base.viewSettings')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >⋯</button>}
        {embedded ? null : <button
          type="button"
          className="nt-base-add"
          disabled={busy}
          title={t('base.addView')}
          onClick={() => {
            void run(async () => {
              await onAddView()
              setActive(doc.views.length)
            })
          }}
        >
          {busy ? '…' : `+ ${t('base.addView')}`}
        </button>}
      </div>

      {menuOpen
        ? (
          <div className="nt-base-settings">
            <label className="nt-base-field">
              <span>{t('base.name')}</span>
              <input
                className="nt-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || draftName.trim() === view.name) return
                  event.preventDefault()
                  void run(() => onRenameView(view.name, draftName.trim()))
                }}
              />
              <button
                type="button"
                className="nt-btn"
                disabled={busy || !draftName.trim() || draftName.trim() === view.name}
                onClick={() => void run(() => onRenameView(view.name, draftName.trim()))}
              >{t('base.rename')}</button>
            </label>

            <div className="nt-base-field">
              <span>{t('base.layout')}</span>
              <div className="nt-switch" role="group" aria-label={t('base.layout')}>
                {LAYOUTS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className={view.type === item.type || (item.type === 'kanban' && view.type === 'board') ? 'is-on' : ''}
                    disabled={busy}
                    onClick={() => void run(() => onSetLayout(view.name, item.type))}
                  >{item.label}</button>
                ))}
              </div>
            </div>

            <label className="nt-base-field">
              <span>{t('base.filter')}</span>
              <input
                className="nt-input"
                placeholder={t('base.filterHint')}
                value={draftFilter}
                onChange={(event) => setDraftFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void run(() => onSetFilter(view.name, draftFilter))
                }}
              />
              <button type="button" className="nt-btn" disabled={busy} onClick={() => void run(() => onSetFilter(view.name, draftFilter))}>
                {t('base.apply')}
              </button>
              <button type="button" className="nt-btn" disabled={busy} onClick={() => { setDraftFilter(''); void run(() => onSetFilter(view.name, '')) }}>
                {t('base.clear')}
              </button>
            </label>

            <div className="nt-base-field">
              <span>{t('base.deleteView')}</span>
              {confirmDelete
                ? (
                  <>
                    <button type="button" className="nt-btn" disabled={busy || doc.views.length <= 1} onClick={() => void run(async () => {
                      await onDeleteView(view.name)
                      setActive(0)
                      setConfirmDelete(false)
                    })}>{t('base.deleteConfirm')}</button>
                    <button type="button" className="nt-btn" onClick={() => setConfirmDelete(false)}>{t('base.cancel')}</button>
                  </>
                )
                : (
                  <button
                    type="button"
                    className="nt-btn"
                    disabled={busy || doc.views.length <= 1}
                    title={doc.views.length <= 1 ? t('base.lastView') : undefined}
                    onClick={() => setConfirmDelete(true)}
                  >{t('base.delete')}</button>
                )}
            </div>
          </div>
        )
        : null}

      {error ? <div className="nt-base-note">{error}</div> : null}
      <div className="nt-base-meta">
        {t('base.rows').replace('{n}', String(view.rows.length)).replace('{total}', String(view.total))}
        {view.groups.length > 1 ? ` · ${view.groups.length} 组` : ''}
      </div>
      {layout === 'board' ? <BoardView view={view} onOpenNote={onOpenNote} /> : null}
      {layout === 'cards' ? <CardsView view={view} onOpenNote={onOpenNote} /> : null}
      {layout === 'list' ? <ListView view={view} onOpenNote={onOpenNote} /> : null}
      {layout === 'table' ? <TableView view={view} onOpenNote={onOpenNote} /> : null}
      {view.rows.length === 0 ? <div className="nt-base-note">{t('base.noRows')}</div> : null}
      {view.note ? <div className="nt-base-note">{view.note}</div> : null}
    </div>
  )
}
