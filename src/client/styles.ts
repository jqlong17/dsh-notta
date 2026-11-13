/** Styles for the notes panel. Theme tokens only; no literal colors. */
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'

export const STYLES = `
.nt-root { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; height: 100%; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-family: ${SANS}; font-size: 13px; line-height: 1.5; }
.nt-tree { display: flex; flex-direction: column; flex: 0 0 248px; min-width: 0; min-height: 0; border-right: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1)); }
.nt-tree-head { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 10px 10px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.nt-tree-heading { display: flex; align-items: center; gap: 4px; min-width: 0; }
.nt-tree-actions { display: flex; flex: none; gap: 2px; }
.nt-tree-action { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 20px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.nt-tree-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nt-tree-collapse { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 20px; padding: 0; line-height: 1; }
.nt-vault-name { flex: 1 1 auto; min-width: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nt-vault-path { font-size: 10px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.nt-notice { flex: none; margin: 0 10px 6px; padding: 4px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; }
.nt-tree-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 6px 14px; }
.nt-tree-node { min-width: 0; }
.nt-row { display: flex; align-items: center; gap: 3px; width: 100%; min-height: 28px; padding: 0 8px 0 2px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.3; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.nt-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nt-row:active { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)); }
.nt-row.is-drop { background: var(--dsw-alias-bg-layer-2); box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary); }
.nt-row.is-editing { background: var(--dsw-alias-bg-layer-2); }
.nt-rename-input { flex: 1 1 auto; min-width: 0; padding: 2px 6px; border: 1px solid var(--dsw-alias-brand-primary); border-radius: 5px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.nt-tree-body.is-drop { box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary); border-radius: 8px; }
.nt-row.is-on { background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); font-weight: 400; }
.nt-row.is-on:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 13%, transparent); }
/* Obsidian's explorer shows selection, not a focus ring; keep the ring subtle and keyboard-only. */
.nt-row:focus { outline: none; }
.nt-row:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3); }
.nt-row:focus:not(:focus-visible) { box-shadow: none; }
.nt-row-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-tree-children { margin-left: 11px; padding-left: 5px; border-left: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent); }
.nt-caret { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1; transition: transform 120ms ease; }
.nt-caret.is-open { transform: rotate(90deg); }
.nt-spacer { flex: none; width: 14px; }
.nt-root.is-dense { flex-direction: row; padding-top: 8px; }
.nt-root.is-dense .nt-tree-head, .nt-root.is-dense .nt-bar { border-top: 0; }
.nt-root.is-dense .nt-notice { flex: none; margin: 0 10px 6px; padding: 4px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; }
.nt-tree-body { padding: 4px 6px 14px; }
.nt-root.is-dense .nt-tree { flex: 0 0 186px; min-width: 0; max-height: none; border-right: 1px solid var(--dsw-alias-border-l1); border-bottom: 0; }
.nt-root.is-dense .nt-tree.is-hidden { display: none; }
.nt-root.is-dense .nt-tree-head { padding: 0 6px 0 10px; min-height: 32px; justify-content: center; gap: 4px; }
.nt-root.is-dense .nt-bar { padding: 0 12px; gap: 6px; min-height: 32px; }
.nt-root.is-dense .nt-doc { padding: 20px 22px 56px; font-size: 14px; }
.nt-root.is-dense .nt-props { margin-bottom: 20px; }
.nt-reader { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.nt-bar { flex: none; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.nt-bar-title { flex: 1 1 auto; min-width: 0; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-switch { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.nt-switch button { border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; padding: 3px 10px; cursor: pointer; }
.nt-switch button.is-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-weight: 600; }
.nt-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.nt-doc { padding: 28px 40px 80px; font-size: 15px; line-height: 1.72; }
.nt-doc > :first-child { margin-top: 0; }
.nt-doc h1, .nt-doc h2, .nt-doc h3, .nt-doc h4, .nt-doc h5, .nt-doc h6 { margin: 1.5em 0 0.55em; line-height: 1.3; font-weight: 650; }
.nt-doc h1 { font-size: 1.72em; }
.nt-doc h2 { font-size: 1.4em; }
.nt-doc h3 { font-size: 1.16em; }
.nt-doc h4 { font-size: 1.02em; }
.nt-doc p { margin: 0.72em 0; }
.nt-doc ul, .nt-doc ol { margin: 0.5em 0; padding-left: 1.5em; }
.nt-doc li { margin: 0.22em 0; }
.nt-doc a { color: var(--dsw-alias-link); text-decoration: none; cursor: pointer; }
.nt-doc a:hover { text-decoration: underline; }
.nt-doc hr { margin: 1.6em 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.nt-doc blockquote { margin: 0.9em 0; padding: 0.1em 0 0.1em 14px; border-left: 3px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); }
.nt-doc code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; padding: 1px 5px; border-radius: 5px; background: var(--dsw-alias-markdown-inline-code, var(--dsw-alias-bg-layer-2)); }
.nt-doc pre { margin: 0.9em 0; padding: 12px 14px; overflow: auto; border-radius: 10px; background: var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-2)); }
.nt-doc pre code { padding: 0; background: transparent; font-size: 12.5px; line-height: 1.6; }
.nt-doc table { display: block; width: max-content; max-width: 100%; overflow: auto; margin: 0.9em 0; border-collapse: collapse; font-size: 0.94em; }
.nt-doc th, .nt-doc td { padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l1); }
.nt-doc th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; text-align: left; }
.nt-doc img, .nt-image { max-width: 100%; height: auto; border-radius: 8px; vertical-align: middle; }
.nt-doc p > .nt-image:only-child { display: block; }
.nt-img-missing { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 6px 10px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; font-size: 12px; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
.nt-doc .task-list-item { list-style: none; margin-left: -1.2em; }
.nt-doc input[type=checkbox] { margin-right: 6px; vertical-align: -2px; }
.nt-doc .ofm-block-anchor-label { display: none; }
.nt-doc p:has(> .ofm-block-anchor-label:only-child) { display: none; }
.nt-doc .ofm-highlight, .nt-doc mark { padding: 1px 3px; border-radius: 3px; color: inherit; background: var(--dsw-alias-markdown-code-segment-selected, var(--dsw-alias-bg-layer-3)); }
.nt-hl-red { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent); }
.nt-hl-orange { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent); }
.nt-hl-yellow { background: color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 34%, transparent); }
.nt-hl-green { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent); }
.nt-hl-blue { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.nt-hl-purple { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent); }
.nt-callout { margin: 1em 0; padding: 10px 14px 10px 12px; border: 1px solid color-mix(in srgb, var(--nt-callout-color, var(--dsw-alias-brand-primary)) 22%, transparent); border-left: 4px solid var(--nt-callout-color, var(--dsw-alias-brand-primary)); border-radius: 6px; background: color-mix(in srgb, var(--nt-callout-color, var(--dsw-alias-brand-primary)) 9%, transparent); }
.nt-callout .ofm-callout-title { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-weight: 650; color: var(--nt-callout-color, var(--dsw-alias-brand-primary)); }
.nt-callout .ofm-callout-title.is-foldable, .nt-callout[data-ofm-foldable] .ofm-callout-title { cursor: pointer; user-select: none; }
.nt-callout-icon { display: inline-flex; flex: none; align-items: center; }
.nt-callout-icon svg { display: block; }
.nt-callout-title-text { flex: 1 1 auto; min-width: 0; }
.nt-fold { flex: none; font-size: 12px; line-height: 1; opacity: 0.65; }
.nt-callout .ofm-callout-content { color: var(--dsw-alias-label-primary); }
.nt-callout .ofm-callout-content > :first-child { margin-top: 0; }
.nt-callout .ofm-callout-content > :last-child { margin-bottom: 0; }
.nt-callout.is-collapsed .ofm-callout-content { display: none; }
details.nt-callout > summary.ofm-callout-title { list-style: none; }
details.nt-callout > summary.ofm-callout-title::-webkit-details-marker { display: none; }
details.nt-callout > summary .nt-fold { transition: transform 120ms ease; }
details.nt-callout[open] > summary .nt-fold { transform: rotate(90deg); }
.nt-embed { margin: 1em 0; padding: 12px 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 0.96em; }
.nt-embed-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.nt-embed-missing { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.nt-props { margin: 0 0 26px; padding: 4px 14px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 13px; }
.nt-props-title { padding: 10px 0 6px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.nt-prop { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent); }
.nt-prop:first-of-type { border-top: 0; }
.nt-prop-icon { flex: none; display: inline-flex; padding-top: 2px; color: var(--dsw-alias-label-tertiary); }
.nt-prop-icon svg { display: block; }
.nt-prop-key { flex: 0 0 104px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.nt-prop-value { flex: 1 1 auto; min-width: 0; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.nt-chips { display: inline-flex; flex-wrap: wrap; gap: 5px; }
.nt-chip { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: 12px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
.nt-check { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px; font-size: 10px; line-height: 1; color: var(--dsw-alias-brand-text); }
.nt-check.is-on { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }

.nt-query { margin: 1em 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.nt-query-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.nt-query-head code { background: transparent; padding: 0; font-size: 12.5px; color: var(--dsw-alias-label-primary); }
.nt-query-icon { display: inline-flex; flex: none; opacity: 0.7; }
.nt-query-state { padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.nt-query-list { display: flex; flex-direction: column; }
.nt-query-row { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border: 0; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 55%, transparent); background: transparent; color: var(--dsw-alias-link); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.nt-query-row:first-child { border-top: 0; }
.nt-query-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nt-query-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-query-count { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.nt-editor { flex: 1 1 auto; min-height: 0; height: 100%; overflow: hidden; }
.nt-editor .cm-editor { height: 100%; }
.nt-save { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.nt-save.is-dirty { color: var(--dsw-alias-state-warn-primary); }
.nt-save.is-saved { color: var(--dsw-alias-state-success-primary); }
.nt-save.is-conflict { color: var(--dsw-alias-state-error-primary); }
.nt-conflict { display: flex; align-items: center; gap: 8px; flex: none; margin: 0; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); font-size: 12px; color: var(--dsw-alias-label-primary); }
.nt-conflict span:first-child { flex: 1 1 auto; min-width: 0; }
.nt-source { margin: 0; padding: 20px 26px 60px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.66; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }
.nt-state { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px 32px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.nt-state strong { color: var(--dsw-alias-label-primary); }
.nt-state-code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.nt-btn { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 5px 12px; cursor: pointer; }
.nt-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nt-btn:disabled { opacity: 0.5; cursor: default; }
.nt-icon-btn { width: 24px; height: 20px; padding: 0; font-size: 13px; line-height: 1; }
.nt-btn.is-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
.nt-btn.is-danger { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); font-weight: 600; }
.nt-btn.is-danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.nt-ctxmenu { position: fixed; z-index: 40; min-width: 150px; padding: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); box-shadow: 0 10px 28px var(--dsw-alias-bg-mask-drop, rgba(0,0,0,0.22)); }
.nt-ctxmenu-item { display: block; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.nt-ctxmenu-item.is-danger { color: var(--dsw-alias-state-error-primary); }
.nt-ctxmenu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nt-mask { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 24px; background: color-mix(in srgb, var(--dsw-alias-bg-mask-drop, #000) 46%, transparent); backdrop-filter: blur(1.5px); }
.nt-dialog { display: flex; flex-direction: column; width: min(400px, 100%); max-height: min(72vh, 560px); overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); box-shadow: 0 18px 44px color-mix(in srgb, var(--dsw-alias-bg-mask-drop, #000) 55%, transparent); }
.nt-dialog.is-wide { width: min(520px, 100%); }
.nt-dialog-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 0; }
.nt-dialog-title { flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.nt-dialog-path { margin: 10px 18px 0; padding: 6px 10px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.nt-dialog-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 18px 4px; }
.nt-dialog-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 16px 18px; }
.nt-dialog-hint { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.nt-input { width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.nt-mermaid { margin: 1em 0; padding: 10px; overflow: auto; border-radius: 10px; background: var(--dsw-alias-bg-layer-1); text-align: center; }
.nt-mermaid svg { max-width: 100%; height: auto; }
.nt-pdf { width: 100%; height: 100%; min-height: 60vh; border: 0; background: var(--dsw-alias-bg-layer-1); }
.nt-pdf-embed { display: block; width: 100%; height: 420px; margin: 1em 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.nt-base-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 12px; padding: 3px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2); width: fit-content; }
.nt-base-tab { border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; }
.nt-base-tab.is-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-weight: 600; }
.nt-base-remove { margin-left: 2px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }
.nt-base-remove:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-state-error-primary); }
.nt-base-confirm { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nt-base-menu { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }
.nt-base-menu:hover, .nt-base-menu.is-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.nt-base-settings { display: flex; flex-direction: column; gap: 8px; margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
.nt-base-field { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nt-base-field > span:first-child { flex: 0 0 64px; }
.nt-base-field .nt-input { flex: 1 1 auto; min-width: 0; }
.nt-base-add { margin-left: 4px; padding: 4px 10px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.nt-base-add:hover:not(:disabled) { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.nt-base-add:disabled { opacity: 0.5; cursor: default; }
.nt-base-meta { margin: 0 0 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.nt-base-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.nt-base-table th, .nt-base-table td { padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.nt-base-table th { font-weight: 600; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.nt-base-table tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
.nt-base-empty { color: var(--dsw-alias-label-tertiary); }
.nt-base-table tfoot td { border-top: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.nt-base-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.nt-base-card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); min-width: 0; }
.nt-base-card-title { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-base-card-title:hover { color: var(--dsw-alias-link); }
.nt-base-card-row { display: flex; gap: 6px; font-size: 12px; min-width: 0; }
.nt-base-card-key { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }
.nt-base-card-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.nt-base-list { display: flex; flex-direction: column; }
.nt-base-list-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); min-width: 0; }
.nt-base-chips { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.nt-chip-key { color: var(--dsw-alias-label-tertiary); }
.nt-base-board { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.nt-base-column { display: flex; flex-direction: column; gap: 8px; flex: 0 0 220px; min-width: 0; }
.nt-base-column-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.nt-base-column-count { color: var(--dsw-alias-label-tertiary); }
.nt-base-note { margin-top: 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.nt-pdf-frame { display: flex; flex-direction: column; margin: 1em 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-base); }
.nt-pdf-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; flex: none; padding: 4px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nt-pdf-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.nt-pdf-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.nt-pdf-btn:disabled { opacity: 0.35; cursor: default; }
.nt-pdf-btn.is-text { color: var(--dsw-alias-label-secondary); text-decoration: none; }
.nt-pdf-btn.is-text.is-on { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); font-weight: 600; }
.nt-pdf-page, .nt-pdf-zoom { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }
.nt-pdf-sep { width: 1px; height: 14px; margin: 0 4px; background: var(--dsw-alias-border-l1); }
.nt-pdf-grow { flex: 1 1 auto; }
.nt-root.is-dense .nt-pdf-bar { font-size: 10px; }
.nt-pdf-stage { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 12px; background: var(--dsw-alias-bg-layer-2); text-align: center; }
.nt-pdf-canvas { display: inline-block; max-width: 100%; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 4px var(--dsw-alias-bg-mask-drop, rgba(0,0,0,0.16)); }
.nt-audio { display: block; width: 100%; margin: 1em 0; }
.nt-video { display: block; max-width: 100%; margin: 1em 0; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.nt-file-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }
.nt-file-ext { text-transform: uppercase; font-size: 9px; color: var(--dsw-alias-label-tertiary); }
.nt-figure { margin: 1em 0; text-align: center; }
`

export const KATEX_CSS_HREF = '/dsh-notta/vendor/katex.min.css'
export const OFM_CSS_HREF = '/dsh-notta/vendor/ofm.css'
