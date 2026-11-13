/**
 * Raw HTML in notes: Obsidian renders it, so we parse it too, but strip the
 * parts that can run code or escape the page frame.
 */
interface HastParent {
  children?: Array<HastNode>
}

interface HastNode extends HastParent {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  value?: string
}

const DROP_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'base', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'object', 'embed', 'template', 'noscript',
  'frame', 'frameset',
])

const DROP_ATTRIBUTE = /^(on|srcdoc$|formaction$|dangerously)/i

/**
 * Vault URLs are relative paths (`笔记2`, `附件/图.png`), so only reject the
 * schemes that execute or escape the page; iframes are stricter below.
 */
function safeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmed)) return true
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase()
  if (!scheme) return true
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return true
  if (scheme === 'data') return /^data:image\//i.test(trimmed)
  return false
}

function remoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

const IFRAME_ALLOWED = new Set(['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder'])

function cleanElement(element: HastNode): boolean {
  const tag = element.tagName ?? ''
  const properties = element.properties ?? {}

  for (const key of Object.keys(properties)) {
    if (DROP_ATTRIBUTE.test(key)) delete properties[key]
  }
  delete properties.style
  delete properties.dangerouslySetInnerHTML

  if (tag === 'iframe') {
    for (const key of Object.keys(properties)) {
      if (!IFRAME_ALLOWED.has(key.toLowerCase())) delete properties[key]
    }
    const src = typeof properties.src === 'string' ? properties.src : ''
    if (!remoteUrl(src)) return false
    properties.loading = 'lazy'
    properties.referrerPolicy = 'no-referrer-when-downgrade'
    properties.sandbox = 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms'
    return true
  }

  if (tag === 'a') {
    const href = typeof properties.href === 'string' ? properties.href : ''
    if (href && !safeUrl(href)) return false
    properties.target = '_blank'
    properties.rel = 'noreferrer noopener'
    return true
  }

  if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio') {
    const src = typeof properties.src === 'string' ? properties.src : ''
    if (src && !safeUrl(src)) return false
  }

  if (tag === 'video' || tag === 'audio') properties.controls = true

  return true
}

function walk(parent: HastParent): void {
  if (!parent.children) return
  parent.children = parent.children.filter((child) => {
    if (child.type !== 'element') return true
    if (DROP_TAGS.has(child.tagName ?? '')) return false
    if (!cleanElement(child)) return false
    walk(child)
    return true
  })
}

/** rehype plugin: parse-in-place already happened, so this only sanitizes. */
export function rehypeVaultHtml() {
  return (tree: HastParent): void => {
    walk(tree)
  }
}
