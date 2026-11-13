#!/usr/bin/env node
/** Bundle the CodeMirror editor as a standalone ES module the panel loads on demand. */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outfile = path.join(repo, 'vendor', 'codemirror.mjs')

await mkdir(path.dirname(outfile), { recursive: true })
const result = await build({
  absWorkingDir: repo,
  entryPoints: [path.join(repo, 'src/client/editor.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
})
if (result.errors.length > 0) process.exit(1)
console.log('[dsh-notta] editor bundle written to vendor/codemirror.mjs')
