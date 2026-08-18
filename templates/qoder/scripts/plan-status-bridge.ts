#!/usr/bin/env node
/**
 * plan-status-bridge.ts — new 项目轻量版（无 DB 定制）
 *
 * 新版 .mjs hooks 通过 `node --import tsx scripts/plan-status-bridge.ts` 查询活跃 Plan 状态，
 * 标准实现依赖 prisma/DB（全量 add-coder 形态）。new 项目为轻量级 add（无数据库），
 * 本桥以文件系统判定活跃 Plan（移植自旧版 .sh hooks 的 detect_active_add 逻辑）：
 *   1. plans/index.md 索引优先 → 2. glob *-handoff*.md（7 天内）→ 3. add-route [ ] 未勾选 = 活跃
 *
 * 输出契约（与 hooks 内 detectActiveAdd 解析一致）:
 *   {"availability":"READY","isActive":true,"planName":"...","progress":{"doneTasks":n,"totalTasks":n},"approvalStatus":"none"}
 *   或 {"availability":"READY","isActive":false}
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// <projectRoot>/<magicDir>/scripts/plan-status-bridge.ts → <projectRoot>
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..", "..")
const MAGIC_DIR = basename(resolve(SCRIPT_DIR, ".."))
const PLANS_DIR = join(PROJECT_ROOT, MAGIC_DIR, "plans")

/** 最近 7 天内的 handoff 候选 */
function recentHandoffCandidates(dir: string, days = 7): string[] {
  if (!existsSync(dir)) return []
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const out: { path: string; mtime: number }[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /handoff.*\.md$/.test(entry.name)) {
        try {
          const mtime = statSync(full).mtimeMs
          if (mtime >= cutoff) out.push({ path: full, mtime })
        } catch { /* ignore */ }
      }
    }
  }
  walk(dir)
  return out.sort((a, b) => b.mtime - a.mtime).map((e) => e.path)
}

/** 从 index.md 表格提取最近 handoff 相对路径 */
function handoffFromIndex(): string {
  const indexFile = join(PLANS_DIR, "index.md")
  if (!existsSync(indexFile)) return ""
  const content = readFileSync(indexFile, "utf-8")
  const m = content.match(/[0-9]{4}-[0-9]{2}\/[0-9]{2}\/[^|]*handoff[^|]*\.md/)
  if (!m) return ""
  const abs = join(PLANS_DIR, m[0])
  return existsSync(abs) ? abs : ""
}

function findHandoff(): string {
  // 1. 索引优先
  const fromIndex = handoffFromIndex()
  if (fromIndex) return fromIndex
  // 2. 退路：glob *-handoff*.md（7 天内，当月优先）
  const today = new Date()
  const monthDir = join(PLANS_DIR, `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`)
  const monthCandidates = recentHandoffCandidates(monthDir)
  if (monthCandidates.length > 0) return monthCandidates[0]
  const all = recentHandoffCandidates(PLANS_DIR)
  return all[0] ?? ""
}

function countMatches(content: string, re: RegExp): number {
  return (content.match(re) ?? []).length
}

function main(): void {
  const handoff = findHandoff()
  if (!handoff) {
    process.stdout.write(JSON.stringify({ availability: "READY", isActive: false }) + "\n")
    return
  }

  const planName = basename(handoff).replace(/-handoff.*/, "")
  const handoffDir = dirname(handoff)

  // add-route：handoff 同目录优先，其次全局
  let addRoute = ""
  for (const dir of [handoffDir, PLANS_DIR]) {
    const found = readdirSync(dir).find((f) => /add-route.*\.md$/.test(f))
    if (found) { addRoute = join(dir, found); break }
  }

  // 活跃判定 + 步骤进度：add-route 中 [x]/[ ] 计数；无 add-route → Plan 初始态，视为活跃
  let doneTasks = 0
  let totalTasks = 0
  let isActive = true
  if (addRoute && existsSync(addRoute)) {
    const content = readFileSync(addRoute, "utf-8")
    doneTasks = countMatches(content, /\[x\]/g)
    const unchecked = countMatches(content, /\[ \]/g)
    totalTasks = doneTasks + unchecked
    if (totalTasks > 0 && unchecked === 0) {
      // 全部 [x] → 已收敛，但 handoff 仍存在（遗留），标记非活跃
      isActive = false
    }
  }

  process.stdout.write(
    JSON.stringify({
      availability: "READY",
      isActive,
      planName,
      progress: { doneTasks, totalTasks },
      approvalStatus: "none",
      handoffPath: handoff,
      addRoutePath: addRoute || "none",
    }) + "\n",
  )
}

main()
