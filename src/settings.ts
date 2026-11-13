/**
 * The panel keeps one vault path. Profile config is the source of truth when
 * the config editor can write it; a small JSON file is the fallback.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { DEFAULT_VAULT, assertDirectory } from './vault.ts'

export interface NottaConfig {
  vaultPath?: string
}

export function settingsFile(): string {
  const home = process.env.DSH_HOME || path.join(process.env.HOME || '', '.dsh')
  return path.join(home, 'dsh-notta', 'settings.json')
}

export async function readSavedPath(): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(settingsFile(), 'utf8')) as { vaultPath?: unknown }
    return typeof parsed.vaultPath === 'string' && parsed.vaultPath.trim() ? parsed.vaultPath : undefined
  } catch {
    return undefined
  }
}

export async function writeSavedPath(vaultPath: string): Promise<void> {
  const file = settingsFile()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ vaultPath }, null, 2)}\n`, 'utf8')
}

export async function resolveVaultPath(config: NottaConfig | undefined): Promise<string> {
  const candidates = [await readSavedPath(), config?.vaultPath, DEFAULT_VAULT]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return await assertDirectory(candidate)
    } catch {
      continue
    }
  }
  return DEFAULT_VAULT
}
