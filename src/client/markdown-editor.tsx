/** React wrapper around the on-demand CodeMirror bundle in `vendor/`. */
import React, { useEffect, useRef, useState } from 'react'

interface EditorHandle {
  focus(): void
  getDoc(): string
  setDoc(text: string): void
  destroy(): void
}

interface EditorModule {
  createEditor(options: {
    parent: HTMLElement
    doc: string
    onChange: (text: string) => void
    onSave: () => void
  }): EditorHandle
}

const EDITOR_SRC = '/dsh-notta/vendor/codemirror.mjs'

let editorModule: Promise<EditorModule> | undefined

function loadEditor(): Promise<EditorModule> {
  if (!editorModule) {
    editorModule = (async () => {
      const specifier = EDITOR_SRC
      return await import(/* keep external: vendored at runtime */ specifier) as EditorModule
    })()
    editorModule.catch(() => {
      editorModule = undefined
    })
  }
  return editorModule
}

export interface MarkdownEditorProps {
  text: string
  onChange: (text: string) => void
  onSave: () => void
  t: (key: string) => string
}

export function MarkdownEditor({ text, onChange, onSave, t }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const handle = useRef<EditorHandle | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const latestChange = useRef(onChange)
  const latestSave = useRef(onSave)
  const initial = useRef(text)

  latestChange.current = onChange
  latestSave.current = onSave

  useEffect(() => {
    let disposed = false
    void loadEditor()
      .then((module) => {
        if (disposed || !host.current) return
        handle.current = module.createEditor({
          parent: host.current,
          doc: initial.current,
          onChange: (value) => latestChange.current(value),
          onSave: () => latestSave.current(),
        })
        handle.current.focus()
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })
    return () => {
      disposed = true
      handle.current?.destroy()
      handle.current = undefined
    }
  }, [])

  if (failed) {
    return (
      <div className="nt-state">
        <strong>{t('editor.failed')}</strong>
        <div className="nt-state-code">{EDITOR_SRC}</div>
      </div>
    )
  }
  return <div className="nt-editor" ref={host} />
}
