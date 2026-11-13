/** Notes page: file tree on the left, rendered note on the right. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { assetUrl, type IndexEntry, type NoteRecord, type RpcResult, type TreeNode, type VaultStatus } from './rpc.ts'
import { BaseView } from './base-view.tsx'
import { MarkdownEditor } from './markdown-editor.tsx'
import { MarkdownView } from './markdown.tsx'
import { KATEX_CSS_HREF, OFM_CSS_HREF, STYLES } from './styles.ts'

export interface NotesPageProps {
  rpc: <T>(op: string, payload?: Record<string, unknown>) => Promise<RpcResult<T>>
  t: (key: string, params?: Record<string, string | number>) => string
  /** Right-sidebar tab: stack the tree above the note and let it collapse. */
  dense?: boolean
}

interface BrowseResult {
  path: string
  parent: string | null
  dirs: Array<{ name: string; path: string }>
}

type Mode = 'read' | 'edit'

function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

function isTreeOpenDefault(node: TreeNode, depth: number): boolean {
  return depth === 0 && node.type === 'dir'
}

function NoteAddIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.2 1.8H4.2a1.3 1.3 0 0 0-1.3 1.3v9.8a1.3 1.3 0 0 0 1.3 1.3h7.6a1.3 1.3 0 0 0 1.3-1.3V5.8z" />
      <path d="M9.2 1.8v4h3.9" />
      <path d="M8 8.4v3.4M6.3 10.1h3.4" />
    </svg>
  )
}

function FolderAddIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.9 4.2a1.2 1.2 0 0 1 1.2-1.2h3l1.3 1.6h5.5a1.2 1.2 0 0 1 1.2 1.2v6.9a1.2 1.2 0 0 1-1.2 1.2H3.1a1.2 1.2 0 0 1-1.2-1.2z" />
      <path d="M8 7.4v3.6M6.2 9.2h3.6" />
    </svg>
  )
}

function TreeRow({
  node, expanded, selected, onToggle, onOpen, onSelect, onMenu, renaming, renameDraft, onRenameDraft,
  onRenameCommit, onRenameCancel, dropTarget, onDropOn, onRowDragStart,
}: {
  node: TreeNode
  expanded: Set<string>
  selected?: string
  onToggle: (path: string) => void
  onOpen: (node: TreeNode) => void
  onSelect: (path: string) => void
  onMenu: (event: React.MouseEvent, node: TreeNode) => void
  renaming?: string
  renameDraft: string
  onRenameDraft: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  dropTarget?: string
  onDropOn: (dir: string) => void
  onRowDragStart: (event: React.DragEvent, node: TreeNode) => void
}) {
  const open = expanded.has(node.path)
  const isDir = node.type === 'dir'
  const editing = renaming === node.path

  if (editing) {
    return (
      <div className="nt-tree-node">
        <div className="nt-row is-editing">
          {isDir ? <span className="nt-caret" aria-hidden="true">›</span> : <span className="nt-spacer" />}
          <input
            className="nt-rename-input"
            value={renameDraft}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => onRenameDraft(event.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onRenameCommit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onRenameCancel()
              }
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="nt-tree-node">
      <button
        type="button"
        className={`nt-row${selected === node.path ? ' is-on' : ''}${dropTarget === node.path ? ' is-drop' : ''}`}
        draggable
        onClick={() => {
          onSelect(node.path)
          if (isDir) onToggle(node.path)
          else onOpen(node)
        }}
        title={node.path}
        aria-expanded={isDir ? open : undefined}
        onContextMenu={(event) => onMenu(event, node)}
        onDragStart={(event) => onRowDragStart(event, node)}
        onDragOver={(event) => {
          if (!isDir) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          if (!isDir) return
          event.preventDefault()
          event.stopPropagation()
          onDropOn(node.path)
        }}
      >
        {isDir
          ? <span className={`nt-caret${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
          : <span className="nt-spacer" />}
        <span className="nt-row-name">{displayName(node)}</span>
      </button>
      {isDir && open && node.children && node.children.length > 0
        ? (
          <div className="nt-tree-children">
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                expanded={expanded}
                selected={selected}
                onToggle={onToggle}
                onOpen={onOpen}
                onSelect={onSelect}
                onMenu={onMenu}
                renaming={renaming}
                renameDraft={renameDraft}
                onRenameDraft={onRenameDraft}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                dropTarget={dropTarget}
                onDropOn={onDropOn}
                onRowDragStart={onRowDragStart}
              />
            ))}
          </div>
        )
        : null}
    </div>
  )
}

/** Markdown notes hide their extension, as Obsidian does. */
function displayName(node: TreeNode): string {
  return node.ext === 'md' || node.ext === 'markdown'
    ? node.name.slice(0, -(node.ext.length + 1))
    : node.name
}

export function NotesPage({ rpc, t, dense = false }: NotesPageProps) {
  const [status, setStatus] = useState<VaultStatus | undefined>()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [index, setIndex] = useState<IndexEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<string | undefined>()
  const [focused, setFocused] = useState<string | undefined>()
  const [draft, setDraft] = useState<string | undefined>()
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'conflict'>('idle')
  const [editorKey, setEditorKey] = useState(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const draftRef = useRef<string | undefined>(undefined)
  const saveStateRef = useRef(saveState)
  draftRef.current = draft
  saveStateRef.current = saveState
  const [doc, setDoc] = useState<NoteRecord | undefined>()
  const [mode, setMode] = useState<Mode>('read')
  const modeRef = useRef<Mode>('read')
  modeRef.current = mode
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [browsing, setBrowsing] = useState<BrowseResult | undefined>()
  const [pathInput, setPathInput] = useState('')
  const [treeOpen, setTreeOpen] = useState(true)
    const [menu, setMenu] = useState<{
    x: number
    y: number
    dir: string
    rename?: string
    renameName?: string
    absolute?: string
    target?: string
  } | undefined>()
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string } | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [renaming, setRenaming] = useState<string | undefined>()
  const [renameDraft, setRenameDraft] = useState('')
  const [dropTarget, setDropTarget] = useState<string | undefined>()
  const dragPath = useRef<string | undefined>(undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [docFragment, setDocFragment] = useState<string | undefined>()
  const [pendingFragment, setPendingFragment] = useState<string | undefined>()
  const docHost = useRef<HTMLDivElement | null>(null)

  const fail = useCallback((result: { error: { message: string } }) => {
    setError(result.error.message)
    setLoading(false)
  }, [])

  const saveRef = useRef<((force?: boolean) => Promise<boolean>) | undefined>(undefined)

  const openPath = useCallback(async (path: string, fragment?: string) => {
    setError(undefined)
    if ((saveStateRef.current === 'dirty' || saveStateRef.current === 'saving') && saveRef.current) {
      const ok = await saveRef.current()
      if (!ok) return
    }
    setDocFragment(fragment)
    setPendingFragment(fragment)
    const result = await rpc<NoteRecord>('read', { path })
    if (!result.ok) {
      fail(result)
      return
    }
    setSelected(result.value.path)
    setFocused(result.value.path)
    setDoc(result.value)
    setMode('read')
  }, [rpc, fail])

  const loadTree = useCallback(async (preferred?: string, resetExpanded = false, keepDoc = false) => {
    const result = await rpc<{ vaultPath: string; tree: TreeNode[]; truncated: boolean; index: IndexEntry[] }>('tree')
    if (!result.ok) {
      fail(result)
      return
    }
    setTree(result.value.tree)
    setIndex(result.value.index)
    setTruncated(result.value.truncated)
    if (resetExpanded) {
      const nextExpanded = new Set<string>()
      for (const node of result.value.tree) if (isTreeOpenDefault(node, 0)) nextExpanded.add(node.path)
      setExpanded(nextExpanded)
    }
    const fallback = result.value.index.find((entry) => entry.path === preferred)
      ?? result.value.index.find((entry) => entry.path === '笔记1.md')
      ?? result.value.index.find((entry) => entry.ext === 'md')
    if (keepDoc) return
    if (fallback) await openPath(fallback.path)
    else {
      setSelected(undefined)
      setDoc(undefined)
    }
  }, [rpc, fail, openPath])

  const parentDir = (rel: string): string => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

  const failIfError = (result: { ok: boolean; error?: { message: string } }): boolean => {
    if (result.ok) return false
    setError(result.error?.message ?? '操作失败')
    return true
  }

  const refreshTree = useCallback(async () => {
    await loadTree(selected)
  }, [loadTree, selected])

  /** Create a note or folder right away, then rename it in place. */
  const createEntry = useCallback(async (kind: 'note' | 'folder', dir: string) => {
    setMenu(undefined)
    setError(undefined)
    const op = kind === 'note' ? 'fs.createNote' : 'fs.createFolder'
    const result = await rpc<{ path: string }>(op, { dir })
    if (failIfError(result)) return
    const created = result.value.path
    await loadTree(kind === 'note' ? created : selected)
    if (kind === 'note') await openPath(created)
    setRenaming(created)
    setRenameDraft('未命名')
    setFocused(created)
  }, [rpc, loadTree, openPath, selected])

  const commitRename = useCallback(async () => {
    const target = renaming
    if (!target) return
    setRenaming(undefined)
    const trimmed = renameDraft.trim()
    if (!trimmed) return
    const isNote = /\.md$/i.test(target)
    const name = isNote && !/\.md$/i.test(trimmed) ? `${trimmed}.md` : trimmed
    const current = target.split('/').pop() ?? target
    if (name === current) return
    const result = await rpc<{ path: string }>('fs.rename', { path: target, name })
    if (failIfError(result)) return
    setFocused(result.value.path)
    await loadTree(result.value.path)
    if (isNote) await openPath(result.value.path)
  }, [renaming, renameDraft, rpc, loadTree, openPath])

  const moveEntry = useCallback(async (path: string, dir: string) => {
    setDropTarget(undefined)
    const result = await rpc<{ path: string }>('fs.move', { path, dir })
    if (failIfError(result)) return
    setFocused(result.value.path)
    await loadTree(result.value.path)
    if (selected === path) await openPath(result.value.path)
  }, [rpc, loadTree, selected, openPath])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(undefined)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 2200)
    return () => clearTimeout(timer)
  }, [notice])

  const copyPath = useCallback(async (absolute: string | undefined) => {
    if (!absolute) return
    try {
      await navigator.clipboard.writeText(absolute)
      setNotice(t('tree.copied'))
    } catch {
      setError(`复制失败，路径是：${absolute}`)
    }
  }, [t])

  const deleteEntry = useCallback(async () => {
    if (!pendingDelete) return
    const { path: target } = pendingDelete
    setPendingDelete(undefined)
    const result = await rpc<{ path: string }>('fs.delete', { path: target })
    if (failIfError(result)) return
    const affected = selected === target || (selected ?? '').startsWith(`${target}/`)
    if (affected) {
      setSelected(undefined)
      setFocused(undefined)
      setDoc(undefined)
    }
    if (focused === target) setFocused(undefined)
    await loadTree(affected ? undefined : selected)
    setNotice(t('tree.deleted'))
  }, [pendingDelete, rpc, selected, failIfError, loadTree, t])

  const boot = useCallback(async () => {
    setLoading(true)
    const result = await rpc<VaultStatus>('status')
    if (!result.ok) {
      fail(result)
      return
    }
    setStatus(result.value)
    if (!result.value.exists) {
      setLoading(false)
      setError(`资料库不存在：${result.value.vaultPath}`)
      return
    }
    await loadTree(selected, true)
    setLoading(false)
  }, [rpc, fail, loadTree, selected])

  useEffect(() => {
    void boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fragment = pendingFragment
    if (!fragment || !doc) return
    const host = docHost.current
    if (!host) return
    const id = fragment.replace(/^\^/, '')
    const timer = setTimeout(() => {
      const target = host.querySelector(`#${CSS.escape(id)}, [data-ofm-block-id="${id}"]`)
      target?.scrollIntoView({ block: 'center' })
      setPendingFragment(undefined)
    }, 60)
    return () => clearTimeout(timer)
  }, [doc, pendingFragment])

  useEffect(() => {
    if (!browsing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBrowsing(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [browsing])

  useEffect(() => {
    if (browsing?.path) setPathInput(browsing.path)
  }, [browsing?.path])

  const addBaseView = useCallback(async () => {
    if (!doc || doc.kind !== 'base') return
    const result = await rpc<NoteRecord>('base.addView', { path: doc.path, type: 'table', name: t('base.newViewName') })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setDoc(result.value)
  }, [doc, rpc])

  const editBase = useCallback(async (op: string, payload: Record<string, unknown> = {}) => {
    if (!doc || doc.kind !== 'base') return
    const result = await rpc<NoteRecord>(op, { path: doc.path, ...payload })
    if (!result.ok) throw new Error(result.error.message)
    setDoc(result.value)
  }, [doc, rpc])

  const renameBaseView = useCallback(async (view: string, to: string) => {
    await editBase('base.renameView', { view, to })
  }, [editBase])

  const setBaseLayout = useCallback(async (view: string, type: string) => {
    await editBase('base.setLayout', { view, type })
  }, [editBase])

  const setBaseFilter = useCallback(async (view: string, expression: string) => {
    await editBase('base.setFilter', { view, expression })
  }, [editBase])

  const moveBaseView = useCallback(async (view: string, index: number): Promise<number> => {
    await editBase('base.moveView', { view, index })
    return index
  }, [editBase])

  const deleteBaseView = useCallback(async (name: string) => {
    await editBase('base.deleteView', { view: name })
  }, [editBase])

  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // Host pushes a frame whenever the vault changes on disk (Obsidian, Finder…).
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let timer: number | undefined
    const source = new EventSource('/dsh-notta/events')
    source.onmessage = (event: MessageEvent<string>) => {
      let payload: { type?: string }
      try {
        payload = JSON.parse(event.data) as { type?: string }
      } catch {
        return
      }
      if (payload.type !== 'change') return
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const editing = modeRef.current === 'edit' && saveStateRef.current === 'dirty'
        void loadTree(selectedRef.current, false, editing)
      }, 300)
    }
    return () => {
      if (timer) window.clearTimeout(timer)
      source.close()
    }
  }, [loadTree])

  const save = useCallback(async (force = false): Promise<boolean> => {
    if (!doc || doc.kind !== 'markdown') return true
    const text = draftRef.current ?? doc.text ?? ''
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    setSaveState('saving')
    const result = await rpc<{ path: string; mtime: number; bytes: number }>('fs.write', {
      path: doc.path,
      text,
      mtime: doc.mtime,
      force,
    })
    if (!result.ok) {
      if (result.error.code === 'conflict') {
        setSaveState('conflict')
        return false
      }
      setSaveState('dirty')
      setError(result.error.message)
      return false
    }
    setDoc({ ...doc, text, mtime: result.value.mtime })
    setDraft(text)
    setSaveState('saved')
    return true
  }, [doc, rpc])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const onEditorChange = useCallback((text: string) => {
    setDraft(text)
    setSaveState('dirty')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void save()
    }, 1500)
  }, [save])

  const reloadFromDisk = useCallback(async () => {
    if (!doc) return
    const result = await rpc<NoteRecord>('read', { path: doc.path })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setDoc(result.value)
    setDraft(result.value.text ?? '')
    setSaveState('idle')
    setEditorKey((value) => value + 1)
  }, [doc, rpc])

  const enterEdit = useCallback(() => {
    if (!doc) return
    setDraft(doc.text ?? '')
    setSaveState('idle')
    setEditorKey((value) => value + 1)
    setMode('edit')
  }, [doc])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadTree(selected)
    } finally {
      setRefreshing(false)
    }
  }, [loadTree, selected])

  // Coming back to the tab after editing in Obsidian: re-read quietly.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!doc) return
      void loadTree(selected)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [doc, selected, loadTree])

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const openWiki = useCallback((target: string, fragment?: string) => {
    const cleaned = target.replace(/^\.\//, '')
    const base = cleaned.split('/').pop() ?? cleaned
    const stem = base.replace(/\.[^.]+$/, '')
    const hit = index.find((entry) => entry.path === cleaned || entry.path === `${cleaned}.md`)
      ?? index.find((entry) => entry.stem === stem || entry.path.split('/').pop() === base)
    if (!hit) {
      setError(`资料库里找不到：${target}`)
      return
    }
    void openPath(hit.path, fragment)
  }, [index, openPath])

  const browse = useCallback(async (path?: string) => {
    const result = await rpc<BrowseResult>('browse', path ? { path } : {})
    if (!result.ok) {
      fail(result)
      return
    }
    setBrowsing(result.value)
  }, [rpc, fail])

  const chooseVault = useCallback(async () => {
    if (!browsing) return
    const result = await rpc<{ vaultPath: string; saved: 'config' | 'file' }>('setVault', { path: browsing.path })
    if (!result.ok) {
      fail(result)
      return
    }
    setBrowsing(undefined)
    setStatus({ vaultPath: result.value.vaultPath, exists: true, settingsFile: '' })
    setLoading(true)
    await loadTree()
    setLoading(false)
  }, [browsing, rpc, fail, loadTree])

  const crumb = useMemo(() => {
    if (!status?.vaultPath) return ''
    const parts = status.vaultPath.split('/').filter(Boolean)
    return parts.slice(-2).join('/')
  }, [status])

  const vaultName = useMemo(() => {
    if (!status?.vaultPath) return ''
    return status.vaultPath.split('/').filter(Boolean).pop() ?? ''
  }, [status])

  return (
    <>
      <style>{STYLES}</style>
      <link rel="stylesheet" href={KATEX_CSS_HREF} />
      <link rel="stylesheet" href={OFM_CSS_HREF} />
      <div className={`nt-root${dense ? ' is-dense' : ''}`}>
      <aside className={`nt-tree${dense && !treeOpen ? ' is-hidden' : ''}`}>
        <div className="nt-tree-head">
          <div className="nt-tree-heading">
            <div className="nt-vault-name" title={status?.vaultPath}>{vaultName || t('tree.vault')}</div>
            <div className="nt-tree-actions">
              <button
                type="button"
                className="nt-btn nt-icon-btn"
                onClick={() => void createEntry('note', selected ? parentDir(selected) : '')}
                aria-label={t('tree.newNote')}
                title={t('tree.newNote')}
              ><NoteAddIcon /></button>
              <button
                type="button"
                className="nt-btn nt-icon-btn"
                onClick={() => void createEntry('folder', selected ? parentDir(selected) : '')}
                aria-label={t('tree.newFolder')}
                title={t('tree.newFolder')}
              ><FolderAddIcon /></button>
            </div>
            {dense
              ? (
                <>
                  <button
                    type="button"
                    className="nt-btn nt-icon-btn"
                    onClick={() => void browse(status?.vaultPath)}
                    aria-label={t('tree.change')}
                    title={t('tree.change')}
                  >⇄</button>
                  <button
                    type="button"
                    className="nt-btn nt-tree-collapse"
                    onClick={() => setTreeOpen(false)}
                    aria-label={t('reader.hideTree')}
                    title={t('reader.hideTree')}
                  >«</button>
                </>
              )
              : null}
          </div>
          {dense ? null : <div className="nt-vault-path" title={status?.vaultPath}>{crumb}</div>}
          {dense
            ? null
            : <button type="button" className="nt-btn" onClick={() => void browse(status?.vaultPath)}>{t('tree.change')}</button>}
        </div>
        {notice ? <div className="nt-notice">{notice}</div> : null}
        <div
          className={`nt-tree-body${dropTarget === '__root__' ? ' is-drop' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (!dropTarget) setDropTarget('__root__')
          }}
          onDragLeave={(event) => {
            if (event.target === event.currentTarget) setDropTarget(undefined)
          }}
          onDrop={(event) => {
            event.preventDefault()
            const dragging = dragPath.current
            dragPath.current = undefined
            setDropTarget(undefined)
            if (dragging) void moveEntry(dragging, '')
          }}
          onContextMenu={(event) => {
            if (event.target !== event.currentTarget) return
            event.preventDefault()
            setMenu({ x: event.clientX, y: event.clientY, dir: '' })
          }}
        >
          {loading && tree.length === 0 ? <div className="nt-state">{t('state.loading')}</div> : null}
          {!loading && tree.length === 0 && !error ? <div className="nt-state">{t('state.emptyVault')}</div> : null}
          {tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              expanded={expanded}
              selected={focused}
              onToggle={toggle}
              onSelect={setFocused}
              onOpen={(child) => void openPath(child.path)}
              renaming={renaming}
              renameDraft={renameDraft}
              onRenameDraft={setRenameDraft}
              onRenameCommit={() => void commitRename()}
              onRenameCancel={() => setRenaming(undefined)}
              dropTarget={dropTarget}
              onDropOn={(dir) => {
                const dragging = dragPath.current
                dragPath.current = undefined
                if (dragging) void moveEntry(dragging, dir)
              }}
              onRowDragStart={(event, node) => {
                dragPath.current = node.path
                event.dataTransfer.setData('text/plain', node.path)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onMenu={(event, node) => {
                event.preventDefault()
                event.stopPropagation()
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  dir: node.type === 'dir' ? node.path : parentDir(node.path),
                  rename: node.path,
                  renameName: displayName(node),
                  absolute: `${(status?.vaultPath ?? '').replace(/\/+$/, '')}/${node.path}`,
                  target: node.path,
                })
              }}
            />
          ))}
          {truncated ? <div className="nt-state-code">{t('state.truncated')}</div> : null}
        </div>
      </aside>

      <section className="nt-reader">
        <div className="nt-bar">
          <div className="nt-bar-title" title={doc?.path}>{doc?.title ?? t('reader.title')}</div>
          <button
            type="button"
            className="nt-btn nt-icon-btn"
            onClick={() => void refresh()}
            disabled={refreshing}
            title={t('reader.refresh')}
            aria-label={t('reader.refresh')}
          >
            {refreshing ? '…' : '⟳'}
          </button>
          {dense && !treeOpen
            ? <button type="button" className="nt-btn" onClick={() => setTreeOpen(true)}>{t('reader.showTree')}</button>
            : null}
          {doc?.kind === 'markdown'
            ? (
              <>
                <span className={`nt-save is-${saveState}`}>{t(`save.${saveState}`)}</span>
                <div className="nt-switch" role="group" aria-label={t('reader.mode')}>
                  <button type="button" className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')}>{t('reader.read')}</button>
                  <button type="button" className={mode === 'edit' ? 'is-on' : ''} onClick={enterEdit}>{t('reader.edit')}</button>
                </div>
              </>
            )
            : null}
        </div>

        {mode === 'edit' && saveState === 'conflict' ? (
          <div className="nt-conflict" role="alert">
            <span>{t('save.conflict')}</span>
            <button type="button" className="nt-btn" onClick={() => void reloadFromDisk()}>{t('save.reload')}</button>
            <button type="button" className="nt-btn is-primary" onClick={() => void save(true)}>{t('save.overwrite')}</button>
          </div>
        ) : null}

        <div className="nt-body" ref={docHost}>
          {error ? (
            <div className="nt-state">
              <strong>{t('state.error')}</strong>
              <div>{error}</div>
              <button type="button" className="nt-btn" onClick={() => { setError(undefined); void boot() }}>{t('state.retry')}</button>
            </div>
          ) : null}

          {!error && doc?.kind === 'markdown' && mode === 'read' ? (
            <MarkdownView
              markdown={doc.text ?? ''}
              embeds={doc.embeds}
              files={doc.files}
              properties={doc.properties}
              onOpenNote={openWiki}
              rpc={rpc}
              t={t}
            />
          ) : null}

          {!error && doc?.kind === 'markdown' && mode === 'edit' ? (
            <MarkdownEditor
              key={`${doc.path}-${editorKey}`}
              text={draft ?? doc.text ?? ''}
              onChange={onEditorChange}
              onSave={() => void save()}
              t={t}
            />
          ) : null}

          {!error && doc?.kind === 'pdf' ? (
            <iframe className="nt-pdf" title={doc.title} src={`${assetUrl(doc.path)}${docFragment ? `#${docFragment}` : ''}`} />
          ) : null}

          {!error && doc?.kind === 'image' ? (
            <div className="nt-doc nt-figure"><img src={assetUrl(doc.path)} alt={doc.title} /></div>
          ) : null}

          {!error && doc?.kind === 'base' && doc.base
            ? <BaseView doc={doc.base} onOpenNote={(path) => void openPath(path)} onAddView={addBaseView} onRenameView={renameBaseView} onDeleteView={deleteBaseView} onSetLayout={setBaseLayout} onSetFilter={setBaseFilter} onMoveView={moveBaseView} t={t} />
            : null}

          {!error && doc?.kind === 'text' ? <pre className="nt-source">{doc.text}</pre> : null}

          {!error && !doc && !loading ? <div className="nt-state">{t('state.pickNote')}</div> : null}

          {!error && doc?.kind === 'binary' ? (
            <div className="nt-state">
              <strong>{t('state.noPreview')}</strong>
              <div className="nt-state-code">{doc.path}</div>
            </div>
          ) : null}
        </div>
      </section>

      {menu ? (
        <div
          className="nt-ctxmenu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="nt-ctxmenu-item"
            onClick={() => void createEntry('note', menu.dir)}
          >{t('tree.newNote')}</button>
          <button
            type="button"
            role="menuitem"
            className="nt-ctxmenu-item"
            onClick={() => void createEntry('folder', menu.dir)}
          >{t('tree.newFolder')}</button>
          {menu.absolute ? (
            <button
              type="button"
              role="menuitem"
              className="nt-ctxmenu-item"
              onClick={() => {
                void copyPath(menu.absolute)
                setMenu(undefined)
              }}
            >{t('tree.copyPath')}</button>
          ) : null}
          {menu.rename ? (
            <button
              type="button"
              role="menuitem"
              className="nt-ctxmenu-item"
              onClick={() => {
                setRenaming(menu.rename)
                setRenameDraft(menu.renameName ?? '')
                setMenu(undefined)
              }}
            >{t('tree.rename')}</button>
          ) : null}
          {menu.target ? (
            <button
              type="button"
              role="menuitem"
              className="nt-ctxmenu-item is-danger"
              onClick={() => {
                setPendingDelete({ path: menu.target as string, name: menu.renameName ?? menu.target })
                setMenu(undefined)
              }}
            >{t('tree.delete')}</button>
          ) : null}
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="nt-mask"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('tree.delete')}
          onClick={(event) => { if (event.target === event.currentTarget) setPendingDelete(undefined) }}
        >
          <div className="nt-dialog">
            <div className="nt-dialog-head">
              <div className="nt-dialog-title">{t('tree.delete')}</div>
            </div>
            <div className="nt-dialog-path">{pendingDelete.path}</div>
            <div className="nt-dialog-list">
              <div className="nt-dialog-hint">{t('tree.deleteHint')}</div>
            </div>
            <div className="nt-dialog-foot">
              <button type="button" className="nt-btn" onClick={() => setPendingDelete(undefined)}>{t('dialog.cancel')}</button>
              <button type="button" className="nt-btn is-danger" onClick={() => void deleteEntry()}>{t('tree.deleteConfirm')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {browsing ? (
        <div className="nt-mask" role="dialog" aria-modal="true" aria-label={t('dialog.title')} onClick={(event) => { if (event.target === event.currentTarget) setBrowsing(undefined) }}>
          <div className="nt-dialog is-wide">
            <div className="nt-dialog-head">
              <div className="nt-dialog-title">{t('dialog.title')}</div>
            </div>
            <div className="nt-dialog-head">
              <input
                className="nt-input"
                value={pathInput}
                placeholder={t('dialog.pathPlaceholder')}
                aria-label={t('dialog.pathPlaceholder')}
                onChange={(event) => setPathInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void browse(pathInput)
                }}
              />
              <button type="button" className="nt-btn" onClick={() => void browse(pathInput)}>{t('dialog.go')}</button>
            </div>
            <div className="nt-dialog-list">
              {browsing.parent
                ? <button type="button" className="nt-row" onClick={() => void browse(browsing.parent ?? undefined)}>↑ {t('dialog.up')}</button>
                : null}
              {browsing.dirs.length === 0 ? <div className="nt-state">{t('dialog.noSubdirs')}</div> : null}
              {browsing.dirs.map((dir) => (
                <button type="button" className="nt-row" key={dir.path} onClick={() => void browse(dir.path)}>
                  <span className="nt-caret">▸</span>
                  <span className="nt-row-name">{dir.name}</span>
                </button>
              ))}
            </div>
            <div className="nt-dialog-foot">
              <button type="button" className="nt-btn" onClick={() => setBrowsing(undefined)}>{t('dialog.cancel')}</button>
              <button type="button" className="nt-btn is-primary" onClick={() => void chooseVault()}>{t('dialog.use')}</button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </>
  )
}
