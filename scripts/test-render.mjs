/**
 * Render the real vault note through the same component overrides the panel
 * uses, then assert the Obsidian formats survive.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import { build } from 'esbuild'

const repo = path.resolve(import.meta.dirname, '..')
const vault = '/Users/ruska/Documents/ob资料库'
const notes = (await readdir(vault, { recursive: true }))
  .filter((name) => name.endsWith('.md'))
  // Skip hidden folders such as .trash, which holds deleted notes.
  .filter((name) => !String(name).split('/').some((part) => part.startsWith('.')))
  .sort()
if (notes.length === 0) {
  console.error('vault has no markdown notes')
  process.exit(1)
}
const notePath = path.join(vault, notes[0])
const embedPath = notes[1] ? path.join(vault, notes[1]) : ''

function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return match ? text.slice(match[0].length) : text
}

const cacheRoot = path.join(repo, 'node_modules', '.cache')
await mkdir(cacheRoot, { recursive: true })
const dir = await mkdtemp(path.join(cacheRoot, 'dsh-notta-render-'))
const outfile = path.join(dir, 'render.mjs')
await build({
  absWorkingDir: repo,
  entryPoints: [path.join(repo, 'scripts/render-entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile,
  logLevel: 'warning',
})

const { render, renderPage, renderBaseTable } = await import(`file://${outfile}`)
const markdown = stripFrontmatter(await readFile(notePath, 'utf8'))
let embed
try {
  if (!embedPath) throw new Error('no second note')
  embed = stripFrontmatter(await readFile(embedPath, 'utf8'))
} catch {
  // The vault may not have the second note any more; the embed check is optional.
  embed = undefined
}
const rawHtml = [
  '<iframe width="560" height="315" src="https://www.youtube.com/embed/fm8P02zyBJQ" title="YouTube"></iframe>',
  '',
  '<script>alert(1)</script>',
  '',
  '<img src="x" onerror="alert(1)">',
  '',
  '<a href="javascript:alert(1)">bad</a>',
].join('\n')
const withImages = `${markdown}\n\n${rawHtml}\n\n![[照片.png|120]]\n\n![](附件/照片.png)\n\n![[没有这张.png]]\n\n![[26332000009560755366.pdf#page=1&height=280]]\n\n![[录音.m4a]]\n`
const files = {
  '照片.png': { path: '附件/照片.png', kind: 'image', ext: 'png' },
  '附件/照片.png': { path: '附件/照片.png', kind: 'image', ext: 'png' },
  '26332000009560755366.pdf': { path: '个人杂项/财务/发票/26332000009560755366.pdf', kind: 'pdf', ext: 'pdf' },
  '录音.m4a': { path: '个人杂项/录音.m4a', kind: 'audio', ext: 'm4a' },
}
const html = render({
  markdown: withImages,
  embeds: embed ? { 笔记2: { markdown: embed, title: '笔记2', path: '笔记2.md' } } : undefined,
  files,
})
await rm(dir, { recursive: true, force: true })

const checks = [
  ['属性栏', /class="nt-props"/],
  ['属性标题', /nt-props-title/],
  ['属性类型图标', /nt-prop-icon/],
  ['标签胶囊', /class="nt-chip"/],
  ['勾选属性', /nt-check is-on/],
  ['属性里的链接', /nt-props[\s\S]*data-ofm-kind="wikilink"|nt-props[\s\S]*ofm-wikilink/],
  ['搜索嵌入', /class="nt-query"/],
  ['搜索嵌入的查询', /个人杂项\/财务\/发票/],
  ['标题', /<h1[^>]*>笔记1<\/h1>/],
  ['内部链接', /data-ofm-path="笔记2"/],
  ['别名链接', /看另一篇/],
  ['标注外壳', /class="nt-callout"/],
  ['标注图标', /nt-callout-icon/],
  ['标注类型', /data-ofm-callout="info"/],
  ['标注标题', /ofm-callout-title/],
  ['标注折叠箭头', /class="nt-fold"/],
  ['折叠标注用 details', /<details[^>]*data-ofm-foldable/],
  ['彩色高亮', /nt-hl-red/],
  ['普通高亮', /class="ofm-highlight"/],
  ['表格', /<table>/],
  ['任务列表', /task-list-item/],
  ['公式', /class="katex"/],
  ['代码块', /<pre><code[^>]*>/],
  ['Mermaid 容器', /class="nt-mermaid"/],
  ...(embed ? [['嵌入笔记', /class="nt-embed/], ['嵌入的正文', /正文/]] : []),
  ['脚注', /footnotes|data-footnote-ref/],
  ['图片按索引解析', /src="\/dsh-notta\/asset\?path=%E9%99%84%E4%BB%B6%2F/],
  ['图片宽度', /width="120"/],
  ['PDF 自绘框架', /class="nt-pdf-frame"/],
  ['PDF 工具栏', /class="nt-pdf-bar"/],
  ['PDF 页码初始', /class="nt-pdf-page">1</],
  ['PDF 高度', /height:280px/],
  ['PDF 打开入口', /在新标签打开/],
  ['PDF 适应宽度', />适应宽度</],
  ['PDF 适应高度', />适应高度</],
  ['音频嵌入', /<audio[^>]*controls/],
  ['原始 HTML iframe', /<iframe[^>]+youtube\.com\/embed\/fm8P02zyBJQ/],
  ['iframe 带沙箱', /sandbox="allow-scripts/],
  ['脚本标签被清掉', /^(?![\s\S]*<script)/],
  ['事件属性被清掉', /^(?![\s\S]*onerror=)/],
  ['javascript 链接被拒', /^(?![\s\S]*javascript:)/],
]
if (/阅读视图里看不见/.test(html)) {
  console.error('inline comment leaked into the reading view')
  process.exit(1)
}
console.log('✓ 行内注释已隐藏')

const failures = []
for (const [name, pattern] of checks) {
  if (pattern.test(html)) console.log(`✓ ${name}`)
  else failures.push(name)
}
if (failures.length) {
  console.error('missing:', failures.join('、'))
  console.error(html.slice(0, 1500))
  process.exit(1)
}
assert.ok(html.length > 5000, 'rendered output too small')

const wide = renderPage(false)
assert.match(wide, /class="nt-root"/)
assert.doesNotMatch(wide, /class="nt-root is-dense"/)
const narrow = renderPage(true)
assert.match(narrow, /class="nt-root is-dense"/)
assert.match(narrow, /nt-tree-collapse/)
assert.match(narrow, /aria-label="tree\.searchPlaceholder"/)
assert.match(narrow, /aria-label="tree\.newNote"/)
assert.match(narrow, /aria-label="tree\.newFolder"/)
assert.match(narrow, /reader\.refresh/)
assert.match(narrow, /ofm-block-anchor-label\s*\{\s*display:\s*none/)
console.log('✓ 右侧栏左右分栏（is-dense + 目录收起）')

// Rendered style text escapes quotes as &quot;, so only stop at the rule end.
if (!/font-family:[^}]*PingFang SC/.test(narrow)) {
  console.error('sans-serif font stack missing from the panel styles')
  process.exit(1)
}
console.log('✓ 无衬线字体栈')

const baseHtml = renderBaseTable()
for (const [label, pattern] of [
  ['Bases 表格', /class="nt-base-table"/],
  ['Bases 表头', /<th>名称<\/th>/],
  ['Bases 属性列', /进行中/],
  ['Bases 行链接', /class="ofm-wikilink"/],
  ['Bases 新建视图', /class="nt-base-add"/],
  ['Bases 视图菜单', /class="nt-base-menu"/],
  ['Bases 页签可拖动', /draggable="true"/],
]) {
  if (!pattern.test(baseHtml)) {
    console.error('missing base check:', label)
    process.exit(1)
  }
}
console.log('✓ Bases 表格渲染')

// The editor ships as a lazily imported vendor module, not inside the client bundle.
const editorBundle = await readFile(path.join(repo, 'vendor', 'codemirror.mjs'), 'utf8')
if (editorBundle.length < 100_000 || !editorBundle.includes('createEditor')) {
  console.error('editor vendor bundle looks wrong')
  process.exit(1)
}
const clientBundle = await readFile(path.join(repo, 'lib', 'client.js'), 'utf8')
// A class only CodeMirror's own theme generates; our styles use `.nt-editor .cm-editor`.
if (clientBundle.includes('cm-activeLine') || clientBundle.includes('cm-scroller')) {
  console.error('CodeMirror leaked into the main client bundle')
  process.exit(1)
}
console.log('✓ 编辑器独立打包，主包未包含 CodeMirror')
console.log(`\nrender OK, ${(html.length / 1024).toFixed(0)} KiB HTML`)
