/** Same-origin RPC for the notes panel. */
export const RPC_ROUTE = '/dsh-notta/rpc'

export interface RpcError {
  code: string
  message: string
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  ext?: string
  children?: TreeNode[]
}

export interface IndexEntry {
  path: string
  stem: string
  ext: string
}

export interface NoteProperty {
  key: string
  value: string
}

export interface BaseRow {
  path: string
  name: string
  ext: string
  folder: string
  values: Record<string, string>
}

export interface BaseGroup {
  key: string | null
  rows: BaseRow[]
}

export interface BaseView {
  name: string
  type: string
  columns: string[]
  rows: BaseRow[]
  groups: BaseGroup[]
  summaries: Record<string, string>
  total: number
  note?: string
}

export interface BaseDocument {
  views: BaseView[]
  error?: string
}

export interface NoteRecord {
  path: string
  kind: 'markdown' | 'pdf' | 'image' | 'audio' | 'video' | 'base' | 'text' | 'binary'
  bytes: number
  title: string
  text?: string
  properties?: NoteProperty[]
  embeds?: Record<string, { markdown: string; title: string; path: string }>
  files?: Record<string, { path: string; kind: string; ext: string }>
  noteDir?: string
  base?: BaseDocument
}

export interface VaultStatus {
  vaultPath: string
  exists: boolean
  settingsFile: string
}

/** Statuses worth retrying: the host may be reloading the plugin. */
const RETRYABLE = new Set([405, 408, 425, 429, 500, 502, 503, 504])
const RETRY_DELAYS = [200, 600, 1200]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusMessage(status: number): string {
  if (status === 405 || status === 502 || status === 503) {
    return `笔记服务暂时不可用（HTTP ${status}），可能刚重启。稍等再点重试；如果一直这样，刷新一次页面。`
  }
  if (status === 401) {
    return '这个页面没有拿到访问凭据（HTTP 401）。刷新一次页面通常能恢复。'
  }
  if (status === 404) {
    return '笔记服务没有注册（HTTP 404）。在插件管理里确认 dsh-notta 已启用，然后重启一次 DSH。'
  }
  return `笔记服务返回 HTTP ${status}。`
}

export function createRpc(fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined) {
  return async function call<T>(op: string, payload: Record<string, unknown> = {}): Promise<RpcResult<T>> {
    if (!fetchImpl) return { ok: false, error: { code: 'no-fetch', message: '当前环境没有 fetch()。' } }
    let lastStatus = 0
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      try {
        const response = await fetchImpl(RPC_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, payload }),
        })
        if (!response.ok) {
          lastStatus = response.status
          if (RETRYABLE.has(response.status) && attempt < RETRY_DELAYS.length) {
            await sleep(RETRY_DELAYS[attempt] ?? 400)
            continue
          }
          return { ok: false, error: { code: `http/${response.status}`, message: statusMessage(response.status) } }
        }
        const body = await response.json() as RpcResult<T>
        if (!body || typeof body !== 'object') return { ok: false, error: { code: 'invalid', message: '笔记服务返回了无效内容。' } }
        return body
      } catch (failure) {
        if (attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt] ?? 400)
          continue
        }
        return { ok: false, error: { code: 'network', message: failure instanceof Error ? failure.message : String(failure) } }
      }
    }
    return { ok: false, error: { code: `http/${lastStatus || 'unknown'}`, message: statusMessage(lastStatus) } }
  }
}

export function assetUrl(rel: string): string {
  return `/dsh-notta/asset?path=${encodeURIComponent(rel)}`
}
