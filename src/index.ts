/**
 * dsh-notta host half: one vault directory, served to the notes panel.
 *
 * The routes need the web server and connection guard, so they register inside
 * an injected scope and the plugin stays inactive in profiles without them.
 */
import type { Context } from '@deepseek-ai/cordis'

import { registerRoutes, saveVaultPath, type VaultStore } from './rpc.ts'
import { resolveVaultPath, type NottaConfig } from './settings.ts'
import { DEFAULT_VAULT } from './vault.ts'

export const name = 'dsh-notta'
export const inject: string[] = []

export function apply(ctx: Context, rawConfig?: NottaConfig): void {
  let vaultPath = rawConfig?.vaultPath || DEFAULT_VAULT
  const store: VaultStore = {
    getPath: () => vaultPath,
    setPath: async (next) => {
      // Settings only: writing the profile config would restart this plugin and
      // drop the HTTP routes for a moment, which clients see as 405.
      await saveVaultPath(ctx as never, rawConfig ?? {}, next, { config: false })
      vaultPath = next
      return { vaultPath: next, saved: 'file' }
    },
  }

  ctx.inject(['connection', 'webServer'], (scope: Context) => {
    scope.effect(() => {
      let disposed = false
      void resolveVaultPath(rawConfig).then((resolved) => {
        if (!disposed) vaultPath = resolved
      })
      const stop = registerRoutes(scope as never, store)
      return () => {
        disposed = true
        stop()
      }
    }, 'dsh-notta: routes')
  })
}
