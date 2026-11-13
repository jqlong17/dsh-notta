#!/usr/bin/env node
/**
 * Refresh `index.json` publish timestamps from the npm registry, so the market
 * index matches reality after a staged first publish is approved.
 *
 *   npm run sync:index
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'https://registry.npmjs.org'
const indexPath = path.join(repo, 'index.json')
const index = JSON.parse(readFileSync(indexPath, 'utf8'))
let changed = 0

for (const plugin of index.plugins) {
  let times
  try {
    times = JSON.parse(execFileSync('npm', ['view', plugin.name, 'time', '--json', `--registry=${REGISTRY}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim())
  } catch {
    console.warn(`[sync] ${plugin.name}: 查询失败，跳过`)
    continue
  }
  for (const entry of plugin.versions) {
    const iso = times[entry.version]
    if (!iso) {
      console.warn(`[sync] ${plugin.name}@${entry.version}: registry 上还没有这个版本`)
      continue
    }
    const stamp = Math.floor(new Date(iso).getTime() / 1000)
    if (entry.publishTimestamp !== stamp) {
      entry.publishTimestamp = stamp
      changed += 1
      console.log(`[sync] ${plugin.name}@${entry.version} -> ${new Date(iso).toISOString()}`)
    }
  }
}

if (changed > 0) {
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8')
  console.log(`[sync] 更新了 ${changed} 条时间戳`)
} else {
  console.log('[sync] 无需改动')
}
