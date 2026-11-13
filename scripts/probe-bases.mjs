import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderBase } from '../src/bases.ts'

const root = '/Users/ruska/Documents/ob资料库'
const text = await readFile(path.join(root, '未命名.base'), 'utf8')
const doc = await renderBase(root, text, '未命名.base')
if (doc.error) throw new Error(doc.error)
for (const view of doc.views) {
  console.log(`--- ${view.name} (${view.type}) rows=${view.rows.length} total=${view.total} groups=${view.groups.length}`)
  console.log('   columns:', view.columns.join(', '))
  console.log('   first:', view.rows[0] ? JSON.stringify(view.rows[0].values) : '(none)')
  console.log('   groups:', view.groups.map((g) => g.key ?? '∅').join(' | '))
  console.log('   summaries:', JSON.stringify(view.summaries))
  if (view.note) console.log('   note:', view.note)
}
