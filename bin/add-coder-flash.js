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
 *   3. 同步生成 <dir>/.qoder-cn/mcp.json（QoderCN IDE 项目级 MCP 配置源，2026-08-22 新增）
 *   4. 默认不覆盖已有文件（--force 覆盖），业务目录（plans/specs/reviews/hitl）不在包内、不受影响
 */
"use strict"

const fs = require("fs")
const path = require("path")

const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "qoder")
const MCP_TEMPLATE = "mcp.json"
// QoderCN IDE 项目级 MCP 配置源（IDE 自动创建并监听，写入即加载；.qoder/mcp.json 仅为 ADD 体系模板，IDE 不直接读取）
const QODER_CN_DIR = ".qoder-cn"

function parseArgs(argv) {
  // 目标目录优先级：--dir 参数 > INIT_CWD（npm/pnpm 生命周期注入的安装起始目录）> 当前目录
  const opts = { command: null, force: false, dir: process.env.INIT_CWD || process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--force" || a === "-f") opts.force = true
    else if (a === "--dir" || a === "-d") opts.dir = path.resolve(argv[++i] ?? "")
    else if (a === "--mcp-name") opts.mcpName = argv[++i] ?? ""
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
  --mcp-name      MCP server 名称（默认取项目 package.json name 或目录名 + -qoder-dev-tools）
  --help, -h      显示帮助

示例:
  add-coder-flash init
  add-coder-flash init --dir ../my-project
  add-coder-flash init --force`)
}

/** 渲染占位符：{{projectRoot}} / {{mcpServerName}} */
function renderPlaceholders(content, projectRoot, mcpServerName) {
  return content
    .replaceAll("{{projectRoot}}", projectRoot.replace(/\\/g, "/"))
    .replaceAll("{{mcpServerName}}", mcpServerName)
}

/** 净化名称：去 @scope/ 前缀，非 [a-zA-Z0-9_-] 替换为 -，转小写 */
function sanitizeName(name) {
  return String(name)
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

/** 推导 MCP server 名：--mcp-name > 项目 package.json name > 目录名，后缀 -qoder-dev-tools；
 *  名称上限 15 个字符（MCP_NAMING_MAX_LEN），超出时按完整单词/拼音边界截取 */
const MCP_NAMING_MAX_LEN = 15

/** 按 - 分段累积截取：保证每段为完整英文单词或中文拼音，不在词中间切断；
 *  单段超长（连续拼音无分隔）时保留完整段，宁长勿碎 */
function truncateToWordBoundary(name, maxLen) {
  if (name.length <= maxLen) return name
  const parts = name.split("-")
  let out = ""
  for (const part of parts) {
    const candidate = out ? `${out}-${part}` : part
    if (candidate.length > maxLen) break
    out = candidate
  }
  return out || parts[0]
}

function resolveMcpServerName(projectRoot, explicit) {
  let base = ""
  if (explicit) base = explicit
  else {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"))
      base = pkg.name ?? ""
    } catch { /* 无 package.json，退回目录名 */ }
  }
  if (!base) base = path.basename(projectRoot)
  const clean = truncateToWordBoundary(sanitizeName(base), MCP_NAMING_MAX_LEN)
  return clean ? `${clean}-qoder-dev-tools` : "add-qoder-dev-tools"
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
  const mcpServerName = resolveMcpServerName(projectRoot, opts.mcpName)

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
    const rendered = renderPlaceholders(fs.readFileSync(mcpTemplate, "utf-8"), projectRootPosix, mcpServerName)
    if (opts.force || !fs.existsSync(mcpTarget)) {
      fs.writeFileSync(mcpTarget, rendered, "utf-8")
      console.log(`   ${opts.force ? "覆盖" : "新建"} ${MCP_TEMPLATE}（已渲染 projectRoot / mcpServerName=${mcpServerName}）`)
    } else {
      console.log(`   跳过 ${MCP_TEMPLATE}（已存在，--force 可覆盖）`)
    }

    // QoderCN 项目级 MCP 配置源同步写入（2026-08-22 新增：QoderCN IDE 只读取项目内 .qoder-cn/mcp.json，
    // 不读取 .qoder/mcp.json；不生成则 MCP 不生效，用户需手动复制）
    const qoderCnTarget = path.join(projectRoot, QODER_CN_DIR, MCP_TEMPLATE)
    if (opts.force || !fs.existsSync(qoderCnTarget)) {
      fs.mkdirSync(path.dirname(qoderCnTarget), { recursive: true })
      fs.writeFileSync(qoderCnTarget, rendered, "utf-8")
      console.log(`   ${opts.force ? "覆盖" : "新建"} ${QODER_CN_DIR}/${MCP_TEMPLATE}（QoderCN 项目级 MCP 配置源，已渲染）`)
    } else {
      console.log(`   跳过 ${QODER_CN_DIR}/${MCP_TEMPLATE}（已存在，--force 可覆盖）`)
    }
  }

  console.log(`\n✅ 完成: 新建 ${stats.created} | 跳过 ${stats.skipped} | 覆盖 ${stats.overwritten}`)
  console.log(`🔌 MCP server: ${mcpServerName}（已生成 .qoder/mcp.json + .qoder-cn/mcp.json，QoderCN 重启后自动加载，无需手动注册）`)
  console.log(`💡 提示:`)
  console.log(`   · 重启 Qoder 使 hooks/settings 配置生效`)
  console.log(`   · tsx / @modelcontextprotocol/sdk 已随本包自动安装，MCP server 可直接使用`)
  console.log(`   · 目标项目已有 plans/specs/reviews/hitl 业务目录不受影响`)
  console.log(`   · 非 QoderCN IDE 请忽略 .qoder-cn/（项目级配置源仅 QoderCN 使用）`)
}

main()
