#!/usr/bin/env node
/**
 * add-coder-flash — 轻量级 ADD 体系（.kimi-code）分发包 CLI
 *
 * 用法:
 *   add-coder-flash init                 # 在当前目录铺 .kimi-code（已存在文件跳过）
 *   add-coder-flash init --force         # 覆盖已有文件
 *   add-coder-flash init --dir <path>    # 指定目标项目目录
 *   add-coder-flash --help
 *
 * 行为:
 *   1. 把包内 templates/kimi-code/ 全部资产复制到目标 <dir>/.kimi-code/
 *   2. 渲染占位符：{{projectRoot}} / {{projectName}} / {{mcpServerName}} / {{magicDir}}
 *   3. 生成 <dir>/.kimi-code/mcp.json（Kimi Code 项目级 MCP 配置源，写入即被读取）
 *   4. 默认不覆盖已有文件（--force 覆盖）；业务目录（plans/specs/reviews/hitl）不在包内、不受影响
 *   5. Kimi Code 的 hooks 规则在 hooks.toml，需合并到 ~/.kimi-code/config.toml
 */
"use strict"

const fs = require("fs")
const path = require("path")

const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "kimi-code")
const MAGIC_DIR = ".kimi-code"
const MCP_TEMPLATE = "mcp.json"
const TEXT_EXTENSIONS = new Set([".md", ".json", ".toml", ".ts", ".mjs", ".sh", ".html", ".txt", ".yml", ".yaml"])

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
  console.log(`add-coder-flash — 轻量级 ADD 体系分发包（Kimi Code / .kimi-code）

用法:
  add-coder-flash init [--force] [--dir <path>]

选项:
  --force, -f     覆盖目标 .kimi-code 中已存在的文件（默认跳过）
  --dir, -d       目标项目目录（默认当前目录）
  --mcp-name      MCP server 名称（默认取项目 package.json name 或目录名 + -kimi-dev-tools）
  --help, -h      显示帮助

示例:
  add-coder-flash init
  add-coder-flash init --dir ../my-project
  add-coder-flash init --force`)
}

/** 渲染占位符：{{projectRoot}} / {{projectName}} / {{mcpServerName}} / {{magicDir}} */
function renderPlaceholders(content, projectRoot, projectName, mcpServerName) {
  return content
    .replaceAll("{{projectRoot}}", projectRoot.replace(/\\/g, "/"))
    .replaceAll("{{projectName}}", projectName)
    .replaceAll("{{mcpServerName}}", mcpServerName)
    .replaceAll("{{magicDir}}", MAGIC_DIR)
}

/** 净化名称：去 @scope/ 前缀，非 [a-zA-Z0-9_-] 替换为 -，转小写 */
function sanitizeName(name) {
  return String(name)
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

/** 推导 MCP server 名：--mcp-name > 项目 package.json name > 目录名，后缀 -kimi-dev-tools；
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

function readPackageName(projectRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"))
    return typeof pkg.name === "string" ? pkg.name : ""
  } catch {
    return ""
  }
}

function resolveMcpServerName(projectRoot, explicit) {
  let base = explicit || readPackageName(projectRoot)
  if (!base) base = path.basename(projectRoot)
  const clean = truncateToWordBoundary(sanitizeName(base), MCP_NAMING_MAX_LEN)
  return clean ? `${clean}-kimi-dev-tools` : "add-kimi-dev-tools"
}

function resolveProjectName(projectRoot, explicit) {
  const base = explicit || readPackageName(projectRoot) || path.basename(projectRoot)
  return String(base).replace(/^@[^/]+\//, "") || "project"
}

/** 递归复制并统计；返回实际写入（created + overwritten）的文件列表 */
function copyTemplateTree(srcDir, destDir, force) {
  const stats = { created: 0, skipped: 0, overwritten: 0 }
  const written = []

  const walk = (src, dest) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true })
        walk(s, d)
        continue
      }
      if (!entry.isFile()) continue
      const exists = fs.existsSync(d)
      if (exists && !force) {
        stats.skipped++
        continue
      }
      fs.mkdirSync(path.dirname(d), { recursive: true })
      fs.copyFileSync(s, d)
      stats[exists ? "overwritten" : "created"]++
      written.push(d)
    }
  }

  walk(srcDir, destDir)
  return { stats, written }
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
  const targetDir = path.join(projectRoot, MAGIC_DIR)
  const projectRootPosix = projectRoot.replace(/\\/g, "/")
  const mcpServerName = resolveMcpServerName(projectRoot, opts.mcpName)
  const projectName = resolveProjectName(projectRoot)

  // 保护：postinstall 自触发场景下，目标目录为包自身（开发/自安装）时跳过，避免污染
  if (path.resolve(projectRoot) === path.resolve(__dirname, "..")) {
    console.log(`⏭️  目标目录是 add-coder-flash 包自身，跳过铺设`)
    return
  }

  console.log(`🔄 add-coder-flash init`)
  console.log(`   目标: ${targetDir}`)
  console.log(`   模式: ${opts.force ? "覆盖（--force）" : "跳过已存在"}`)

  fs.mkdirSync(targetDir, { recursive: true })
  const { stats, written } = copyTemplateTree(TEMPLATE_DIR, targetDir, opts.force)

  // 渲染所有新写入的文本文件（跳过已存在文件，避免改动用户内容）
  for (const file of written) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue
    const content = fs.readFileSync(file, "utf-8")
    fs.writeFileSync(file, renderPlaceholders(content, projectRootPosix, projectName, mcpServerName), "utf-8")
  }

  console.log(`\n✅ 完成: 新建 ${stats.created} | 跳过 ${stats.skipped} | 覆盖 ${stats.overwritten}`)
  console.log(`🔌 MCP server: ${mcpServerName}（已生成 ${MAGIC_DIR}/${MCP_TEMPLATE}）`)
  console.log(`💡 提示:`)
  console.log(`   · Kimi Code 项目级 MCP：新会话自动加载 ${MAGIC_DIR}/${MCP_TEMPLATE}（首次需在信任提示中信任本目录）`)
  console.log(`   · hooks：把 ${MAGIC_DIR}/hooks.toml 的 [[hooks]] 段合并到 ~/.kimi-code/config.toml 后重启会话`)
  console.log(`   · tsx / @modelcontextprotocol/sdk 已随本包自动安装，MCP server 可直接使用`)
  const tsxBin = path.join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx")
  if (!fs.existsSync(tsxBin)) {
    console.log(`   · ⚠️ 未找到 ${path.relative(projectRoot, tsxBin) || "node_modules/.bin/tsx"}；pnpm 项目请执行 \`pnpm add -D tsx\`，或把 ${MAGIC_DIR}/${MCP_TEMPLATE} 的 command 改为可用的 tsx 路径`)
  }
  console.log(`   · 目标项目已有 plans/specs/reviews/hitl 业务目录不受影响`)
}

main()
