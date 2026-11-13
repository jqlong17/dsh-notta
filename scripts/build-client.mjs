#!/usr/bin/env node
/** Bundle the browser half and copy the vendor stylesheets and fonts. */
import { build } from 'esbuild'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_ID = 'dsh-notta'
const ENTRY = path.join(repo, 'src/client/index.tsx')
const OUTFILE = path.join(repo, 'lib/client.js')
const EXTERNAL = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime']

function indent(text) {
  return text.split('\n').map((line) => (line.length === 0 ? line : `    ${line}`)).join('\n')
}

function wrap(body) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${indent(body)}
    return module.exports;
  }
});
`
}

const result = await build({
  absWorkingDir: repo,
  entryPoints: [ENTRY],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: EXTERNAL,
  write: false,
  logLevel: 'warning',
  legalComments: 'none',
  charset: 'utf8',
  sourcemap: false,
  loader: { '.css': 'empty' },
})

const output = result.outputFiles?.[0]
if (!output) {
  console.error('[dsh-notta] esbuild produced no output')
  process.exit(1)
}

await mkdir(path.dirname(OUTFILE), { recursive: true })
const wrapped = wrap(output.text.trimEnd())
await writeFile(OUTFILE, wrapped)
console.log(`[dsh-notta] client bundle ${(wrapped.length / 1024).toFixed(0)} KiB`)

// Vendor: KaTeX stylesheet + fonts (flat), and mdian's OFM stylesheet.
const vendor = path.join(repo, 'vendor')
await mkdir(vendor, { recursive: true })

const katexCss = await readFile(path.join(repo, 'node_modules/katex/dist/katex.min.css'), 'utf8')
await writeFile(path.join(vendor, 'katex.min.css'), katexCss.replaceAll('url(fonts/', 'url(./'))
const fonts = await readdir(path.join(repo, 'node_modules/katex/dist/fonts'))
for (const font of fonts) {
  await copyFile(path.join(repo, 'node_modules/katex/dist/fonts', font), path.join(vendor, font))
}
console.log(`[dsh-notta] vendored katex css and ${fonts.length} font files`)

await copyFile(path.join(repo, 'node_modules/mdian/dist/styles.css'), path.join(vendor, 'ofm.css'))
console.log('[dsh-notta] vendored ofm.css')

await copyFile(path.join(repo, 'node_modules/mermaid/dist/mermaid.min.js'), path.join(vendor, 'mermaid.min.js'))
console.log('[dsh-notta] vendored mermaid.min.js')

for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(path.join(repo, 'node_modules/pdfjs-dist/build', name), path.join(vendor, name))
}
console.log('[dsh-notta] vendored pdf.js module and worker')
