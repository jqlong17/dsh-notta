/**
 * CodeMirror 6 entry, bundled separately into `vendor/codemirror.mjs`.
 *
 * The panel loads it on demand so the main client bundle stays small. Styles
 * come from CodeMirror's own JS-injected sheets; colors are theme tokens.
 */
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'

export interface EditorOptions {
  parent: HTMLElement
  doc: string
  onChange: (text: string) => void
  onSave: () => void
}

export interface EditorHandle {
  focus(): void
  getDoc(): string
  setDoc(text: string): void
  destroy(): void
}

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13.5px',
    color: 'var(--dsw-alias-label-primary)',
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.7',
    padding: '16px 0 60px',
  },
  '.cm-content': { caretColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)',
  },
  '.cm-line': { padding: '0 20px' },
})

export function createEditor(options: EditorOptions): EditorHandle {
  const { parent, doc, onChange, onSave } = options
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown(),
        bracketMatching(),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => { onSave(); return true } },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
        theme,
      ],
    }),
  })
  return {
    focus: () => view.focus(),
    getDoc: () => view.state.doc.toString(),
    setDoc: (text: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    destroy: () => view.destroy(),
  }
}
