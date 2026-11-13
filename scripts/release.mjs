#!/usr/bin/env node
/**
 * One-command release: bump, build, publish to npm, then refresh the market
 * index with the registry's real publish time and push.
 *
 *   npm run release -- patch|minor|major     (default: patch)
 *
 * Credentials come from ~/.npmrc (written by `npm login`); this script never
 * reads or prints the token.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'https://registry.npmjs.org'
const bump = process.argv[2] ?? 'patch'
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`未知的版本类型：${bump}（用 patch / minor / major）`)
  process.exit(1)
}

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: repo,
  stdio: 'inherit',
  encoding: 'utf8',
  ...options,
})
const capture = (command, args) => execFileSync(command, args, {
  cwd: repo,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

// 1. Credentials
let user
try {
  user = capture('npm', ['whoami', `--registry=${REGISTRY}`])
} catch {
  console.error('npm 未登录或 token 已过期。先执行：\nnpm login --auth-type=web --registry=https://registry.npmjs.org')
  process.exit(1)
}
console.log(`[release] npm 用户：${user}`)

// 2. Clean tree
const dirty = capture('git', ['status', '--porcelain'])
if (dirty) {
  console.error('[release] 工作区有未提交改动，先提交或清理：\n' + dirty)
  process.exit(1)
}

// 3. Bump + build
run('npm', ['version', bump, '--no-git-tag-version'])
const pkg = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'))
console.log(`[release] 新版本：${pkg.version}`)
run('npm', ['run', 'build'])

// 4. Publish
try {
  run('npm', ['publish', `--registry=${REGISTRY}`, '--access', 'public'])
} catch {
  console.error('[release] 发布失败。若报 409 staged version，说明上一次已提交，等审核完成再重试。')
  process.exit(1)
}

// 5. Index timestamp from the registry (staged first publishes may lag)
const deadline = Date.now() + 10 * 60 * 1000
let stamp
while (Date.now() < deadline) {
  try {
    const raw = capture('npm', ['view', `${pkg.name}@${pkg.version}`, 'time', '--json', `--registry=${REGISTRY}`])
    const parsed = JSON.parse(raw)
    const value = parsed?.time ?? parsed
    const iso = typeof value === 'string' ? value : value?.[pkg.version]
    if (iso) {
      stamp = Math.floor(new Date(iso).getTime() / 1000)
      break
    }
  } catch {
    // Still staging; retry.
  }
  await new Promise((resolve) => setTimeout(resolve, 15000))
}

const indexPath = path.join(repo, 'index.json')
const index = JSON.parse(readFileSync(indexPath, 'utf8'))
const entry = index.plugins.find((plugin) => plugin.name === pkg.name)
if (entry) {
  const timestamp = stamp ?? Math.floor(Date.now() / 1000)
  const existing = entry.versions.find((item) => item.version === pkg.version)
  if (existing) existing.publishTimestamp = timestamp
  else entry.versions.unshift({
    version: pkg.version,
    publishTimestamp: timestamp,
    source: { type: 'npm' },
    engines: { dsh: '>=0.2.2-rc.1' },
  })
  entry.versions.sort((a, b) => (a.version < b.version ? 1 : -1))
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8')
  console.log(stamp
    ? `[release] 索引已更新：${pkg.version} @ ${timestamp}`
    : '[release] 尚未查到发布时间，索引用当前时间占位；稍后手动更新')
}

// 6. Commit + push
const staged = ['package.json', 'index.json']
if (readFileSync(path.join(repo, 'package-lock.json'), 'utf8').length > 0) staged.push('package-lock.json')
run('git', ['add', ...staged])
run('git', ['-c', 'user.name=' + (process.env.GIT_AUTHOR_NAME ?? user),
  '-c', 'user.email=' + (process.env.GIT_AUTHOR_EMAIL ?? `${user}@users.noreply.github.com`),
  'commit', '-m', `chore: release v${pkg.version}`])
run('git', ['push'])
console.log(`[release] 完成：${pkg.name}@${pkg.version}`)
