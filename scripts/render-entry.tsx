/** Render entry used by scripts/test-render.mjs. */
import { renderToStaticMarkup } from 'react-dom/server'

import { MarkdownView } from '../src/client/markdown.tsx'
import { NotesPage } from '../src/client/page.tsx'
import { BaseView } from '../src/client/base-view.tsx'

export function render(props: {
  markdown: string
  embeds?: Record<string, { markdown: string; title: string; path: string }>
  files?: Record<string, { path: string; kind: string; ext: string }>
}): string {
  return renderToStaticMarkup(
    <MarkdownView
      markdown={props.markdown}
      embeds={props.embeds}
      files={props.files}
      onOpenNote={() => {}}
      properties={[
        { key: 'aliases', kind: 'list', value: '格式手册', items: ['格式手册'] },
        { key: 'tags', kind: 'tags', value: '格式、财务/发票', items: ['格式', '财务/发票'] },
        { key: '日期', kind: 'date', value: '2026-11-13' },
        { key: '已整理', kind: 'checkbox', value: 'true' },
        { key: '相关', kind: 'link', value: '[[笔记2]]' },
      ]}
    />,
  )
}

export function renderPage(dense: boolean): string {
  const rpc = (async () => ({ ok: false, error: { code: 'offline', message: 'offline' } })) as never
  return renderToStaticMarkup(<NotesPage rpc={rpc} t={(key: string) => key} dense={dense} />)
}

export function renderBaseTable(): string {
  return renderToStaticMarkup(
    <BaseView
      doc={{
        views: [{
          name: '全部',
          type: 'table',
          columns: ['file.name', '状态'],
          total: 2,
          groups: [{ key: null, rows: [] }],
          summaries: { 状态: '2' },
          rows: [
            { path: '甲.md', name: '甲', ext: 'md', folder: '', values: { 'file.name': '甲', 状态: '进行中' } },
            { path: '乙.md', name: '乙', ext: 'md', folder: '', values: { 'file.name': '乙', 状态: '完成' } },
          ],
        }, {
          name: '第二个视图',
          type: 'table',
          columns: ['file.name'],
          total: 2,
          groups: [{ key: null, rows: [] }],
          summaries: {},
          rows: [],
        }],
      }}
      onOpenNote={() => {}}
      onAddView={async () => {}}
      onDeleteView={async () => {}}
      t={(key: string) => key}
    />,
  )
}
