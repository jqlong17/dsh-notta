/** Backlinks and outlinks for the open note, under the reading view. */
import React, { useEffect, useState } from 'react'

import type { RpcResult } from './rpc.ts'

interface LinkItem {
  path: string | null
  title: string | null
  label?: string
}

interface LinkPayload {
  path: string
  backlinks: Array<{ path: string; title: string }>
  outlinks: LinkItem[]
  embeds: LinkItem[]
}

export interface BacklinksProps {
  path: string
  rpc: <T>(op: string, payload?: Record<string, unknown>) => Promise<RpcResult<T>>
  onOpenNote: (path: string) => void
  t: (key: string) => string
}

function Row({ item, onOpenNote, unresolved }: {
  item: LinkItem
  onOpenNote: (path: string) => void
  unresolved: string
}) {
  const label = item.title ?? item.label ?? item.path ?? ''
  if (!item.path) {
    return <div className="nt-link-row is-missing" title={unresolved}>{label}</div>
  }
  return (
    <button type="button" className="nt-link-row" onClick={() => onOpenNote(item.path as string)} title={item.path}>
      {label}
    </button>
  )
}

export function Backlinks({ path, rpc, onOpenNote, t }: BacklinksProps) {
  const [payload, setPayload] = useState<LinkPayload | undefined>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPayload(undefined)
    setFailed(false)
    void rpc<LinkPayload>('links', { path }).then((result) => {
      if (cancelled) return
      if (result.ok) setPayload(result.value)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, rpc])

  if (failed) return null
  if (!payload) return <div className="nt-links"><div className="nt-links-empty">{t('links.loading')}</div></div>

  const sections: Array<{ key: string; title: string; items: LinkItem[] }> = [
    { key: 'backlinks', title: t('links.backlinks'), items: payload.backlinks.map((item) => ({ path: item.path, title: item.title })) },
    { key: 'outlinks', title: t('links.outlinks'), items: payload.outlinks },
    { key: 'embeds', title: t('links.embeds'), items: payload.embeds },
  ]

  return (
    <div className="nt-links">
      {sections.map((section) => (
        <div className="nt-links-section" key={section.key}>
          <div className="nt-links-head">
            <span>{section.title}</span>
            <span className="nt-links-count">{section.items.length}</span>
          </div>
          {section.items.length === 0
            ? <div className="nt-links-empty">{t('links.none')}</div>
            : section.items.map((item, index) => (
              <Row
                key={`${section.key}-${item.path ?? item.label ?? index}`}
                item={item}
                onOpenNote={onOpenNote}
                unresolved={t('links.unresolved')}
              />
            ))}
        </div>
      ))}
    </div>
  )
}
