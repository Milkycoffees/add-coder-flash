#!/usr/bin/env node
/**
 * add-coder-flash — new 项目轻量级 ADD 体系（.qoder）分发包 CLI
 *
 * 用法:
 *   add-coder-flash init                 # 在当前目录铺 .qoder（已存在文件跳过）
 *   add-coder-flash init --force         # 覆盖已有文件
 *   add-coder-flash init --dir <path>    # 指定目标项目目录
 *   add-coder-flash --help
 *
 * 行为:
 *   1. 把包内 templates/qoder/ 全部资产复制到目标 <dir>/.qoder/
 *   2. mcp.json 中的 {{projectRoot}} 占位符渲染为目标项目绝对路径
 *   3. 默认不覆盖已有文件（--force 覆盖），业务目录（plans/specs/reviews/hitl）不在包内、不受影响
 */
"use strict"

const fs = require("fs")
const path = require("path")

const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "qoder")
const MCP_TEMPLATE = "mcp.json"

function parseArgs(argv) {
  // 目标目录优先级：--dir 参数 > INIT_CWD（npm/pnpm 生命周期注入的安装起始目录）> 当前目录
  const opts = { command: null, force: false, dir: process.env.INIT_CWD || process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--force" || a === "-f") opts.force = true
    else if (a === "--dir" || a === "-d") opts.dir = path.resolve(argv[++i] ?? "")
    else if (a === "--help" || a === "-h") opts.help = true
    else if (!opts.command) opts.command = a
  }
  return opts
}

function printHelp() {
  console.log(`add-coder-flash — 轻量级 ADD 体系分发包

用法:
  add-coder-flash init [--force] [--dir <path>]

选项:
  --force, -f     覆盖目标 .qoder 中已存在的文件（默认跳过）
  --dir, -d       目标项目目录（默认当前目录）
  --help, -h      显示帮助

示例:
  add-coder-flash init
  add-coder-flash init --dir ../my-project
  add-coder-flash init --force`)
}

/** 渲染 {{projectRoot}} 占位符 */
function renderProjectRoot(content, projectRoot) {
  return content.replaceAll("{{projectRoot}}", projectRoot.replace(/\\/g, "/"))
}

/** 复制前统计：目标中已存在 = skipped（非 force）或 overwritten（force），否则 created */
function countSyncedFiles(srcDir, destDir, force) {
  const stats = { created: 0, skipped: 0, overwritten: 0 }
  const walk = (src, dest) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name === MCP_TEMPLATE) continue
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        walk(s, d)
      } else if (entry.isFile()) {
        if (force) stats.overwritten++
        else if (fs.existsSync(d)) stats.skipped++
        else stats.created++
      }
    }
  }
  walk(srcDir, destDir)
  return stats
}

function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    printHelp()
    return
  }
  if (opts.command !== "init") {
    console.error(`未知命令: ${opts.command ?? "(空)"}（仅支持 init）`)
    process.exitCode = 1
    return
  }
  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error(`模板目录不存在: ${TEMPLATE_DIR}`)
    process.exitCode = 1
    return
  }

  const projectRoot = opts.dir
  const targetDir = path.join(projectRoot, ".qoder")
  const projectRootPosix = projectRoot.replace(/\\/g, "/")

  // 保护：postinstall 自触发场景下，目标目录为包自身（开发/自安装）时跳过，避免污染
  if (path.resolve(projectRoot) === path.resolve(__dirname, "..")) {
    console.log(`⏭️  目标目录是 add-coder-flash 包自身，跳过铺设`)
    return
  }

  console.log(`🔄 add-coder-flash init`)
  console.log(`   目标: ${targetDir}`)
  console.log(`   模式: ${opts.force ? "覆盖（--force）" : "跳过已存在"}`)

  fs.mkdirSync(targetDir, { recursive: true })

  // 复制前统计（mcp.json 除外，单独处理）
  const stats = countSyncedFiles(TEMPLATE_DIR, targetDir, opts.force)

  // 复制：非 force 时跳过已存在文件（filter 排除）；force 时覆盖
  const copyFilter = (src, dest) => {
    if (path.basename(src) === MCP_TEMPLATE) return false
    if (!opts.force) {
      // 目录始终合并（缺文件时补缺）；文件按存在性跳过
      if (fs.statSync(src).isDirectory()) return true
      if (fs.existsSync(dest)) return false
    }
    return true
  }
  fs.cpSync(TEMPLATE_DIR, targetDir, {
    recursive: true,
    force: opts.force,
    filter: copyFilter,
  })

  // mcp.json 渲染写入（{{projectRoot}} → 目标项目绝对路径）
  const mcpTemplate = path.join(TEMPLATE_DIR, MCP_TEMPLATE)
  const mcpTarget = path.join(targetDir, MCP_TEMPLATE)
  if (fs.existsSync(mcpTemplate)) {
    const rendered = renderProjectRoot(fs.readFileSync(mcpTemplate, "utf-8"), projectRootPosix)
    if (opts.force || !fs.existsSync(mcpTarget)) {
      fs.writeFileSync(mcpTarget, rendered, "utf-8")
      console.log(`   ${opts.force ? "覆盖" : "新建"} ${MCP_TEMPLATE}（已渲染 projectRoot）`)
    } else {
      console.log(`   跳过 ${MCP_TEMPLATE}（已存在，--force 可覆盖）`)
    }
  }

  console.log(`\n✅ 完成: 新建 ${stats.created} | 跳过 ${stats.skipped} | 覆盖 ${stats.overwritten}`)
  console.log(`💡 提示:`)
  console.log(`   · 重启 Qoder 使 hooks/settings 配置生效`)
  console.log(`   · tsx / @modelcontextprotocol/sdk 已随本包自动安装，MCP server 可直接使用`)
  console.log(`   · 目标项目已有 plans/specs/reviews/hitl 业务目录不受影响`)
}

main()
