/**
 * Browser half of `dsh-notta`: a main panel under the Automation tasks row, and
 * the same page as a right-sidebar tab for reading next to the conversation.
 */
import type { Context } from '@deepseek-ai/cordis'

import { NotesPage } from './page.tsx'
import { createRpc } from './rpc.ts'
import { NS, en, zh } from './labels.ts'

/** Panel id shared by the main slot, the sidebar list and the right tab. */
export const PANEL_ID = 'dsh-notta'
/** Right-sidebar tab kind, used by the right pane's tab catalog. */
export const TAB_KIND = 'notta-note'

export const inject = ['slots', 'sidebarRightTabs', 'locale'] as const

function PanelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <path
        d="M9 6.5h12.2L27 12.2V29a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 7 29V9A2.5 2.5 0 0 1 9.5 6.5H9z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M21 6.9V12h5.1" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 17.4h8.4M12 21.2h10.4M12 25h6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-notta: dictionaries')
  const t = ctx.locale.bind(NS)
  const rpc = createRpc()

  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ rpc, t }),
  }, NotesPage)), 'dsh-notta: page')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t('panel'),
  }, PanelIcon)), 'dsh-notta: sidebar')

  // Right sidebar: one tab type, plus its guide row in the "+" menu.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PANEL_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => t('panel'),
    guide: [{
      id: PANEL_ID,
      order: 58,
      title: () => t('panel'),
      description: () => t('guide.description'),
    }],
  }), 'dsh-notta: right tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ rpc, t, dense: true }),
  }, NotesPage)), 'dsh-notta: right tab body')
}
