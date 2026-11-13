import assert from 'node:assert/strict'
import { readTree, flatten, readNote, findByTarget, kindFor, assertDirectory } from '../src/vault.ts'

const root = await assertDirectory('/Users/ruska/Documents/ob资料库')
const { tree, truncated } = await readTree(root)
const index = flatten(tree)
console.log('vault:', root)
console.log('entries:', index.length, 'truncated:', truncated)
console.log('notes:', index.filter(e => e.ext === 'md').map(e => e.path).join(', '))
console.log('pdfs:', index.filter(e => e.ext === 'pdf').length)
assert.ok(index.filter(e => e.ext === 'md').length >= 1, 'no markdown notes in the vault')
assert.equal(index.filter(e => e.path.startsWith('.obsidian')).length, 0, 'hidden dir leaked')
const firstNote = index.find(e => e.ext === 'md')
const note = await readNote(root, firstNote.path)
assert.equal(typeof note.text, 'string')
// Resolution works for a name that exists and returns nothing for a fake one.
const selfHit = findByTarget(index, firstNote.stem)
assert.equal(selfHit?.path, firstNote.path)
assert.equal(findByTarget(index, '这个名字肯定不存在-xyz'), undefined)
assert.equal(kindFor('pdf'), 'pdf')
assert.equal(kindFor('md'), 'markdown')
console.log('OK vault checks passed')
