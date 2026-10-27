/// <reference types="node" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFile, readdir, stat, writeFile } from "fs/promises"
import { basename, join, relative, resolve } from "path"
import { existsSync } from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..", "..")

async function tryLoadEnv() {
  const dotenvPath = resolve(PROJECT_ROOT, "node_modules", "dotenv")
  try {
    const dotenv = await import(dotenvPath)
    const envFile = existsSync(join(PROJECT_ROOT, ".env.development"))
      ? ".env.development"
      : existsSync(join(PROJECT_ROOT, ".env"))
        ? ".env"
        : null
    if (envFile) {
      dotenv.config({ path: join(PROJECT_ROOT, envFile) })
    }
  } catch {
    // dotenv not installed, skip
  }
}

type ToolResponse = Array<{ type: "text"; text: string }>

function textResponse(text: string): { content: ToolResponse } {
  return { content: [{ type: "text", text }] }
}

function errorResponse(message: string): { content: ToolResponse; isError: boolean } {
  return { content: [{ type: "text", text: message }], isError: true }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

function formatLocalTime(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')

  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

async function findFilesRecursive(dir: string, pattern: RegExp, maxDepth = 5): Promise<string[]> {
  const results: string[] = []
  if (maxDepth <= 0) return results
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") {
        const subResults = await findFilesRecursive(fullPath, pattern, maxDepth - 1)
        results.push(...subResults)
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath)
      }
    }
  } catch {
    // Ignore non-existent dirs
  }
  return results
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer(
  {
    name: "{{mcpServerName}}",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// ── Tool 1: get_project_context ─────────────────────────────

server.registerTool(
  "get_project_context",
  {
    description: "获取当前项目的完整上下文：目录结构、技术栈（从 package.json 依赖推断）、包管理信息、项目规则（ADD 范式）与 ADD 工作流状态。AI 助手在生成代码前应调用此工具获取项目真实信息，避免幻觉。",
    inputSchema: {
      scope: z.string().optional().describe("获取信息的范围: 'structure' 仅目录结构, 'rules' 仅项目规则, 'package' 仅包信息, 'all' 全部"),
    },
  },
  async (args: { scope?: string }) => {
    try {
      const scope = args?.scope || "all"
      const parts: string[] = []

      if (scope === "all" || scope === "package") {
        const pkg = await readFileSafe(join(PROJECT_ROOT, "package.json"))
        if (pkg) {
          const parsed = JSON.parse(pkg)
          const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) }
          const stack: string[] = []
          for (const [name, label] of [
            ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["next", "Next.js"],
            ["nuxt", "Nuxt"], ["vite", "Vite"], ["typescript", "TypeScript"], ["express", "Express"],
            ["fastify", "Fastify"], ["vue-router", "Vue Router"], ["react-router-dom", "React Router"],
            ["pinia", "Pinia"], ["element-plus", "Element Plus"], ["tailwindcss", "Tailwind CSS"],
          ] as const) {
            if (deps[name]) stack.push(`${label} ${deps[name]}`)
          }
          parts.push("=== 项目信息 ===")
          parts.push(`名称: ${parsed.name}`)
          parts.push(`版本: ${parsed.version}`)
          parts.push(`技术栈: ${stack.length ? stack.join(" + ") : "未识别（无常见框架依赖）"}`)
          parts.push("")
          parts.push("核心依赖:")
          for (const [name, ver] of Object.entries(deps).slice(0, 20)) {
            parts.push(`  ${name}: ${ver}`)
          }
          parts.push("")
          parts.push("可用脚本:")
          for (const [name, script] of Object.entries(parsed.scripts || {})) {
            parts.push(`  ${name}: ${script}`)
          }
          parts.push("")
        }
      }

      if (scope === "all" || scope === "rules") {
        const rules = await readFileSafe(join(PROJECT_ROOT, ".kimi-code", "rules", "project_rules.md"))
        if (rules) {
          parts.push("=== 项目规则 (ADD 范式强制约束) ===")
          const lines = rules.split("\n")
          let inCodeBlock = false
          for (const line of lines) {
            if (line.startsWith("```")) {
              inCodeBlock = !inCodeBlock
              continue
            }
            if (inCodeBlock) continue
            if (line.startsWith("## ADD-") || line.startsWith("## 项目") || line.startsWith("## SKILL-") || line.startsWith("## 禁止项")) {
              parts.push("")
              parts.push(line)
            }
          }
          parts.push("")
        }
      }

      if (scope === "all" || scope === "structure") {
        parts.push("=== 项目目录结构 ===")
        const topDirs = ["src", ".kimi-code", "public", "mock"]
        for (const dir of topDirs) {
          const fullPath = join(PROJECT_ROOT, dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            const displayItems = entries.slice(0, 20).join(", ")
            parts.push(`  ${dir}/ (${entries.length} 项): ${displayItems}${entries.length > 20 ? " ..." : ""}`)
          }
        }
        parts.push("")
        parts.push("=== src/ 子目录结构 ===")
        const srcRoot = join(PROJECT_ROOT, "src")
        if (existsSync(srcRoot)) {
          const entries = await readdir(srcRoot, { withFileTypes: true })
          for (const entry of entries.filter((e) => e.isDirectory()).slice(0, 20)) {
            const fullPath = join(srcRoot, entry.name)
            const children = await readdir(fullPath)
            const items = children.slice(0, 15).join(", ")
            parts.push(`  src/${entry.name}/ (${children.length} 项): ${items}${children.length > 15 ? " ..." : ""}`)
          }
        }
      }

      if (scope === "add-state") {
        const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
        const rounds = await readJsonSafe<Record<string, { round: number; closedAt?: string }>>(ROUNDS_FILE, {})
        const plans = await listPlanEntries()
        parts.push("=== ADD 工作流状态 ===")
        parts.push(`Plan 总数: ${plans.length}`)
        parts.push("")
        const active = plans.filter((p) => (lifecycles[p.name]?.lifecycle ?? "ACTIVE") !== "CLOSED")
        parts.push(`活跃 Plan: ${active.length}`)
        for (const plan of active) {
          const p = await collectPlanProgress(plan)
          const lc = lifecycles[plan.name]?.lifecycle ?? "ACTIVE"
          parts.push(`  - ${plan.name} [${lc}] tasks ${p.doneTasks}/${p.totalTasks} checklist ${p.checklistDone}/${p.checklistTotal} round ${rounds[plan.name]?.round ?? 0}`)
        }
        parts.push("")
        parts.push("=== 待执行 ADD 操作 ===")
        const pending: string[] = []
        for (const plan of active) {
          const p = await collectPlanProgress(plan)
          if (!existsSync(join(p.specDir, "spec.md"))) pending.push(`${plan.name}: 缺 spec.md`)
          if (!existsSync(join(p.specDir, "tasks.md"))) pending.push(`${plan.name}: 缺 tasks.md`)
          if (!existsSync(join(p.specDir, "checklist.md"))) pending.push(`${plan.name}: 缺 checklist.md`)
          if (!p.handoff) pending.push(`${plan.name}: 缺 handoff`)
          if (!p.addRoute) pending.push(`${plan.name}: 缺 add-route`)
          if (p.totalTasks > 0 && p.doneTasks < p.totalTasks) pending.push(`${plan.name}: tasks 未闭环 ${p.doneTasks}/${p.totalTasks}`)
          if (p.checklistTotal > 0 && p.checklistDone < p.checklistTotal) pending.push(`${plan.name}: checklist 未闭环 ${p.checklistDone}/${p.checklistTotal}`)
        }
        if (pending.length) {
          for (const item of pending) parts.push(`  - ${item}`)
        } else {
          parts.push("  （无待执行项）")
        }
        parts.push("")
        parts.push("下一步: 空白对话先调用 skills: session-init；开发变更走 add-paradigm SKILL。")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取项目上下文失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 2: get_vue_component_info ──────────────────────────

server.registerTool(
  "get_vue_component_info",
  {
    description: "获取 Vue 组件的结构信息。读取 .vue 单文件组件，提取 Props、Emits、核心逻辑结构。AI 助手在编写或修改 Vue 组件前应调用此工具了解现有组件接口。",
    inputSchema: {
      component: z.string().optional().describe("组件文件路径（相对于 src/），如 'views/Home/Index.vue'。不指定则返回所有组件列表。"),
    },
  },
  async (args: { component?: string }) => {
    try {
      const { component } = args

      if (component) {
        const filePath = join(PROJECT_ROOT, "src", component)
        const content = await readFileSafe(filePath)
        if (!content) {
          return errorResponse(`未找到组件: src/${component}`)
        }

        const parts: string[] = [`=== 组件: src/${component} ===`, ""]

        // 提取 Props 定义
        const propsMatch = content.match(/defineProps<([\s\S]*?)>/)
        if (propsMatch) {
          parts.push("--- Props ---")
          parts.push(propsMatch[1].trim())
          parts.push("")
        }

        // 提取 Emits 定义
        const emitsMatch = content.match(/defineEmits<([\s\S]*?)>/)
        if (emitsMatch) {
          parts.push("--- Emits ---")
          parts.push(emitsMatch[1].trim())
          parts.push("")
        }

        // 提取生命周期钩子
        const lifecycleHooks = [
          "onMounted", "onUnmounted", "onBeforeMount", "onBeforeUnmount",
          "onUpdated", "onBeforeUpdate", "onActivated", "onDeactivated",
        ]
        const foundHooks = lifecycleHooks.filter(hook => content.includes(hook))
        if (foundHooks.length > 0) {
          parts.push("--- 生命周期钩子 ---")
          parts.push(foundHooks.join(", "))
          parts.push("")
        }

        // 统计行数
        const lines = content.split("\n").length
        parts.push(`总行数: ${lines}`)

        return textResponse(parts.join("\n"))
      }

      // 返回所有组件列表
      const vueFiles = await findFilesRecursive(join(PROJECT_ROOT, "src"), /\.vue$/)
      const parts: string[] = ["=== Vue 组件列表 ===", ""]
      const byDir: Record<string, string[]> = {}

      for (const file of vueFiles) {
        const relPath = relative(join(PROJECT_ROOT, "src"), file)
        const dir = relPath.includes("/") ? relPath.split("/")[0] : "root"
        if (!byDir[dir]) byDir[dir] = []
        byDir[dir].push(relPath)
      }

      for (const [dir, files] of Object.entries(byDir).sort()) {
        parts.push(`--- ${dir}/ (${files.length} 个组件) ---`)
        for (const f of files.slice(0, 30)) {
          parts.push(`  ${f}`)
        }
        if (files.length > 30) parts.push(`  ... 共 ${files.length} 个`)
        parts.push("")
      }

      parts.push(`总计: ${vueFiles.length} 个 .vue 组件`)
      parts.push("")
      parts.push('提示: 指定 component 参数获取组件详情，例如: get_vue_component_info({ component: "views/Home/Index.vue" })')

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取组件信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 3: get_route_definition ────────────────────────────

server.registerTool(
  "get_route_definition",
  {
    description: "获取 Vue Router 路由定义。返回路由配置结构，包括路由路径、组件、meta 信息等。AI 助手在新增或修改路由时应调用此工具。",
    inputSchema: {
      route: z.string().optional().describe("路由路径片段，如 'system/user'。不指定则返回路由模块列表。"),
    },
  },
  async (args: { route?: string }) => {
    try {
      const routerDir = join(PROJECT_ROOT, "src", "router")
      const files = await readdir(routerDir)
      const routerFiles = files.filter(f => f.endsWith(".ts") || f.endsWith(".js"))

      const { route } = args
      if (route) {
        // 搜索包含该路径的路由文件
        let found = false
        const parts: string[] = [`=== 路由搜索: "${route}" ===`, ""]

        for (const file of routerFiles) {
          const content = await readFileSafe(join(routerDir, file))
          if (content && content.toLowerCase().includes(route.toLowerCase())) {
            found = true
            parts.push(`--- ${file} ---`)
            const lines = content.split("\n")
            const matchedLines = lines.filter(
              line => line.toLowerCase().includes(route.toLowerCase())
            )
            for (const line of matchedLines.slice(0, 20)) {
              parts.push(`  ${line.trim()}`)
            }
            parts.push("")
          }
        }

        if (!found) {
          return errorResponse(`未找到匹配路由: "${route}"`)
        }

        return textResponse(parts.join("\n"))
      }

      // 返回路由概况
      const parts: string[] = ["=== Vue Router 路由定义 ===", ""]
      for (const file of routerFiles) {
        const content = await readFileSafe(join(routerDir, file))
        if (content) {
          const lines = content.split("\n")
          parts.push(`--- ${file} (${lines.length} 行) ---`)

          // 提取路由 path 定义
          const pathMatches = content.match(/path:\s*['"]([^'"]+)['"]/g)
          if (pathMatches) {
            const uniquePaths = [...new Set(pathMatches.map(m => m.replace(/path:\s*['"]/, "").replace(/['"]/g, "")))]
            for (const p of uniquePaths.slice(0, 30)) {
              parts.push(`  ${p}`)
            }
            if (uniquePaths.length > 30) parts.push(`  ... 共 ${uniquePaths.length} 个路由`)
          }
          parts.push("")
        }
      }

      parts.push('提示: 指定 route 参数搜索特定路由，例如: get_route_definition({ route: "system/user" })')

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取路由定义失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 4: get_api_definition ──────────────────────────────

server.registerTool(
  "get_api_definition",
  {
    description: "获取 API 接口定义。读取 src/api/ 目录下的接口模块，返回请求/响应类型定义和接口函数。AI 助手在编写 API 调用代码时应调用此工具。",
    inputSchema: {
      module: z.string().optional().describe("API 模块路径，如 'system/user'。不指定则返回所有 API 模块列表。"),
    },
  },
  async (args: { module?: string }) => {
    try {
      const apiDir = join(PROJECT_ROOT, "src", "api")
      const { module } = args

      if (module) {
        const filePath = join(apiDir, module, "index.ts")
        const altPath = join(apiDir, `${module}.ts`)
        let content = await readFileSafe(filePath)
        if (!content) content = await readFileSafe(altPath)
        if (!content) {
          return errorResponse(`未找到 API 模块: ${module}`)
        }

        const parts: string[] = [`=== API 模块: ${module} ===`, ""]

        // 提取 interface/type 定义
        const typeMatches = content.match(/(?:export\s+)?(?:interface|type)\s+\w+[\s\S]*?\{[\s\S]*?\}/g)
        if (typeMatches) {
          parts.push("--- 类型定义 ---")
          for (const t of typeMatches) {
            const short = t.split("\n").slice(0, 10).join("\n")
            parts.push(short)
            if (t.split("\n").length > 10) parts.push("  ...")
            parts.push("")
          }
        }

        // 提取 API 函数
        const funcMatches = content.match(/export\s+(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g)
        if (funcMatches) {
          parts.push("--- API 函数 ---")
          for (const f of funcMatches) {
            const firstLine = f.split("\n")[0].trim()
            parts.push(`  ${firstLine}`)
          }
          parts.push("")
        }

        return textResponse(parts.join("\n"))
      }

      // 返回所有 API 模块列表
      const parts: string[] = ["=== API 模块列表 ===", ""]
      const walkDir = async (dir: string, prefix: string): Promise<void> => {
        try {
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              await walkDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
            } else if (entry.isFile() && entry.name.endsWith(".ts")) {
              const modulePath = prefix ? `${prefix}/${entry.name.replace(".ts", "")}` : entry.name.replace(".ts", "")
              parts.push(`  ${modulePath}`)
            }
          }
        } catch {
          // Ignore
        }
      }
      await walkDir(apiDir, "")
      parts.push("")
      parts.push('提示: 指定 module 参数获取模块详情，例如: get_api_definition({ module: "system/user" })')

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 API 定义失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 5: find_related_docs ───────────────────────────────

server.registerTool(
  "find_related_docs",
  {
    description: "搜索 .kimi-code/ 目录下与当前变更相关的项目文档（规则、计划、Spec 等）。AI 助手在 ADD 范式 Step 0（文档先行）中应调用此工具查找需要更新的文档。",
    inputSchema: {
      query: z.string().describe("搜索关键词，如功能名、模块名、API 名等"),
      category: z.string().optional().describe("文档类别: 'rules' 规则, 'plans' 计划, 'specs' 规格说明, 'skills' 技能, 'all' 全部"),
    },
  },
  async (args: { query: string; category?: string }) => {
    try {
      const { query, category } = args
      const traeDir = join(PROJECT_ROOT, ".kimi-code")

      const searchDirs: Array<{ dir: string; type: string }> = []
      const categories = category ? [category] : ["rules", "plans", "specs", "skills"]
      for (const cat of categories) {
        const dir = join(traeDir, cat)
        if (existsSync(dir)) {
          searchDirs.push({ dir, type: cat })
        }
      }

      const results: Array<{ path: string; type: string; matches: string[] }> = []
      for (const { dir, type } of searchDirs) {
        const files = await findFilesRecursive(dir, /\.(md|json)$/, 3)
        for (const file of files) {
          const content = await readFileSafe(file)
          if (content && content.toLowerCase().includes(query.toLowerCase())) {
            const relativePath = relative(PROJECT_ROOT, file)
            const lines = content.split("\n")
            const matchingLines = lines.filter(line =>
              line.toLowerCase().includes(query.toLowerCase()) && line.trim().length > 0
            )
            results.push({
              path: relativePath,
              type,
              matches: matchingLines.slice(0, 5),
            })
          }
        }
      }

      if (results.length === 0) {
        return textResponse(`未找到与 "${query}" 相关的文档。`)
      }

      const parts: string[] = [
        `=== 相关文档 (关键词: "${query}") ===`,
        `共找到 ${results.length} 个文档`,
        "",
      ]

      for (const result of results) {
        parts.push(`📄 [${result.type}] ${result.path}`)
        for (const match of result.matches) {
          parts.push(`   > ${match.trim().substring(0, 120)}`)
        }
        parts.push("")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`搜索文档失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 6: check_phase_symmetry ────────────────────────────

server.registerTool(
  "check_phase_symmetry",
  {
    description: "检查 Vue 组件中的生命周期对称性（ADD-2 规则）。检查 onMounted/onUnmounted 配对，确保资源创建和清理对称。AI 助手在编写组件后应调用此工具验证。",
    inputSchema: {
      code: z.string().describe("要检查的 Vue 组件代码文本（.vue 文件的 script setup 部分）"),
    },
  },
  async (args: { code: string }) => {
    try {
      const { code } = args
      if (!code) return errorResponse("code 参数不能为空")

      const issues: string[] = []

      // 检查 onMounted/onUnmounted 配对
      const hasMounted = code.includes("onMounted")
      const hasUnmounted = code.includes("onUnmounted")
      const hasBeforeMount = code.includes("onBeforeMount")
      const hasBeforeUnmount = code.includes("onBeforeUnmount")

      // 检查事件监听器
      const hasAddEventListener = code.includes("addEventListener") || code.includes("window.addEventListener")
      const hasRemoveEventListener = code.includes("removeEventListener") || code.includes("window.removeEventListener")

      if (hasAddEventListener && !hasRemoveEventListener) {
        issues.push("❌ 检测到 addEventListener 但未找到 removeEventListener — 应在 onUnmounted 中清理")
      }

      // 检查定时器
      const hasSetInterval = code.includes("setInterval")
      const hasClearInterval = code.includes("clearInterval")
      if (hasSetInterval && !hasClearInterval) {
        issues.push("❌ 检测到 setInterval 但未找到 clearInterval — 应在 onUnmounted 中清理")
      }

      const hasSetTimeout = code.includes("setTimeout")
      const hasClearTimeout = code.includes("clearTimeout")
      if (hasSetTimeout && !hasClearTimeout && code.includes("let ") && code.includes("setTimeout")) {
        // 只有使用了变量存储 timeoutId 时才需要清理
        issues.push("⚠️ 检测到 setTimeout 存入了变量但未找到 clearTimeout — 建议在 onUnmounted 中清理")
      }

      // 检查 watch/watcher
      const watchCount = (code.match(/watch\(/g) || []).length
      const watchStopCount = (code.match(/stop\(\)|unwatch\(\)/g) || []).length
      if (watchCount > watchStopCount && hasUnmounted) {
        issues.push("⚠️ 检测到 watch() 调用但 onUnmounted 中可能缺少 stop() 调用")
      }

      if (issues.length === 0) {
        const lines: string[] = [
          "=== ADD-2 生命周期对称性检查 ===",
          "",
          `onMounted: ${hasMounted ? "✅" : "未使用"}`,
          `onUnmounted: ${hasUnmounted ? "✅" : "未使用"}`,
          `onBeforeMount: ${hasBeforeMount ? "✅" : "未使用"}`,
          `onBeforeUnmount: ${hasBeforeUnmount ? "✅" : "未使用"}`,
          `事件监听器: ${hasAddEventListener ? (hasRemoveEventListener ? "✅ 已配对" : "⚠️ 未配对") : "未使用"}`,
          `定时器: ${hasSetInterval ? (hasClearInterval ? "✅ 已配对" : "⚠️ 未配对") : "未使用"}`,
          "",
          issues.length === 0 ? "✅ 生命周期对称性检查通过" : "",
        ]
        return textResponse(lines.join("\n"))
      }

      const lines: string[] = [
        "=== ADD-2 生命周期对称性检查 ===",
        `发现 ${issues.length} 个问题:`,
        "",
        ...issues,
        "",
        "建议: 确保 onMounted 中创建的资源在 onUnmounted 中清理",
      ]
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查生命周期对称性失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 7: check_failure_path ──────────────────────────────

server.registerTool(
  "check_failure_path",
  {
    description: "检查 Vue 组件中的失败路径处理（ADD-6 规则）。检查 try/catch 块中 catch 是否有用户提示和错误处理，确保错误信息密度不低于成功路径。",
    inputSchema: {
      code: z.string().describe("要检查的 Vue 组件代码文本"),
    },
  },
  async (args: { code: string }) => {
    try {
      const { code } = args
      if (!code) return errorResponse("code 参数不能为空")

      const issues: string[] = []

      // 查找 try/catch 块
      const tryBlocks = code.match(/try\s*\{/g)
      if (!tryBlocks) {
        return textResponse("=== ADD-6 失败路径检查 ===\n\n未检测到 try/catch 块，无需检查。")
      }

      const sections = code.split(/catch\s*\(/)
      if (sections.length <= 1) {
        return textResponse("=== ADD-6 失败路径检查 ===\n\n未检测到完整的 catch 块，无需检查。")
      }

      for (let i = 1; i < sections.length; i++) {
        const catchBlock = sections[i]
        const braceIdx = catchBlock.indexOf("{")
        if (braceIdx === -1) continue

        // 找到 catch 块的结束
        let depth = 1
        let endIdx = braceIdx + 1
        while (depth > 0 && endIdx < catchBlock.length) {
          if (catchBlock[endIdx] === "{") depth++
          else if (catchBlock[endIdx] === "}") depth--
          endIdx++
        }
        const catchBody = catchBlock.slice(braceIdx + 1, endIdx - 1)

        // 检查是否有用户提示
        const hasElMessage = catchBody.includes("ElMessage") || catchBody.includes("$message")
        const hasConsoleError = catchBody.includes("console.error")
        const hasConsoleOnly = hasConsoleError && !hasElMessage && catchBody.trim().split("\n").length <= 2

        const blockNum = i

        if (!hasElMessage && !hasConsoleError) {
          issues.push(`❌ catch 块 #${blockNum}: 缺少用户提示和错误日志 — 应添加 ElMessage.error() 或 console.error()`)
        } else if (hasConsoleOnly) {
          issues.push(`⚠️ catch 块 #${blockNum}: 仅有 console.error，缺少用户提示 — 应添加 ElMessage.error()`)
        }

        // 检查空 catch
        if (catchBody.trim().length === 0) {
          issues.push(`❌ catch 块 #${blockNum}: 空 catch 块 — 禁止空 catch！`)
        }
      }

      if (issues.length === 0) {
        return textResponse(
          "=== ADD-6 失败路径检查 ===\n\n" +
          `检测到 ${tryBlocks.length} 个 try/catch 块\n\n` +
          "✅ 所有 catch 块错误处理合理"
        )
      }

      const lines: string[] = [
        "=== ADD-6 失败路径检查 ===",
        `检测到 ${tryBlocks.length} 个 try/catch 块`,
        `发现 ${issues.length} 个问题:`,
        "",
        ...issues,
        "",
        "建议: 每个 catch 块必须包含 ElMessage.error() 用户提示",
      ]
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查失败路径失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 8: query_audit_records ─────────────────────────────

server.registerTool(
  "query_audit_records",
  {
    description: "查询开发操作审计记录。从 .kimi-code/plans/ 和 .kimi-code/specs/ 文档中提取开发操作记录。AI 可在不同对话会话中通过这些记录恢复开发上下文。",
    inputSchema: {
      keyword: z.string().optional().describe("关键词搜索，在 Plan/Spec 文档中模糊匹配"),
      sinceMinutes: z.number().optional().describe("时间窗口（分钟），基于文件修改时间过滤"),
      limit: z.number().optional().default(10).describe("返回最大条数，默认 10"),
    },
  },
  async (args: { keyword?: string; sinceMinutes?: number; limit?: number }) => {
    try {
      const { keyword, sinceMinutes, limit = 10 } = args

      const plansDir = join(PROJECT_ROOT, ".kimi-code", "plans")
      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")

      const allDocs: Array<{ path: string; type: string; mtime: Date }> = []

      for (const dir of [plansDir, specsDir]) {
        if (!existsSync(dir)) continue
        const files = await findFilesRecursive(dir, /\.md$/, 5)
        for (const file of files) {
          try {
            const s = await stat(file)
            const type = file.includes("plans") ? "plan" : "spec"
            allDocs.push({ path: relative(PROJECT_ROOT, file), type, mtime: s.mtime })
          } catch {
            // Ignore
          }
        }
      }

      // 按修改时间降序排序
      allDocs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

      let filtered = allDocs
      if (sinceMinutes !== undefined) {
        const since = new Date(Date.now() - sinceMinutes * 60 * 1000)
        filtered = filtered.filter(d => d.mtime >= since)
      }

      if (keyword) {
        const matched: typeof filtered = []
        for (const doc of filtered) {
          const content = await readFileSafe(join(PROJECT_ROOT, doc.path))
          if (content && content.toLowerCase().includes(keyword.toLowerCase())) {
            matched.push(doc)
          }
        }
        filtered = matched
      }

      const limited = filtered.slice(0, Math.min(limit, 50))

      if (limited.length === 0) {
        const parts: string[] = ["=== 审计记录查询 ==="]
        if (keyword) parts.push(`关键词: "${keyword}"`)
        if (sinceMinutes) parts.push(`时间范围: 最近 ${sinceMinutes} 分钟`)
        parts.push("")
        parts.push("未找到匹配的审计记录。")
        parts.push("")
        parts.push(`文档总数: ${allDocs.length} (Plan + Spec)`)

        if (allDocs.length > 0) {
          parts.push("最近文档:")
          for (const doc of allDocs.slice(0, 5)) {
            parts.push(`  [${doc.type}] ${doc.path} (${formatLocalTime(doc.mtime)})`)
          }
        }

        return textResponse(parts.join("\n"))
      }

      const parts: string[] = [
        "=== 审计记录 ===",
        keyword ? `关键词: "${keyword}"` : "",
        `匹配 ${limited.length} 条，共 ${filtered.length} 条`,
        "",
      ]

      for (const doc of limited) {
        parts.push(`[${doc.type}] ${doc.path}`)
        parts.push(`修改时间: ${formatLocalTime(doc.mtime)}`)

        // 读取摘要
        const content = await readFileSafe(join(PROJECT_ROOT, doc.path))
        if (content) {
          const lines = content.split("\n")
          const title = lines[0]?.replace(/^#+\s*/, "").trim() || ""
          if (title) parts.push(`  标题: ${title}`)

          // 提取关键信息
          if (keyword) {
            const matchedLines = lines.filter(l =>
              l.toLowerCase().includes(keyword.toLowerCase()) && l.trim().length > 0
            )
            for (const ml of matchedLines.slice(0, 3)) {
              parts.push(`  > ${ml.trim().substring(0, 100)}`)
            }
          }
        }
        parts.push("")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`查询审计记录失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 9: record_dev_operation ────────────────────────────

server.registerTool(
  "record_dev_operation",
  {
    description: "记录一次开发操作到审计文档。AI 助手在对代码进行修改/创建/删除操作后，应调用此工具记录操作。前端项目无数据库，审计记录写入 .kimi-code/plans/ 下的活动 Plan 文档中。",
    inputSchema: {
      action: z.enum(["CREATE", "MODIFY", "DELETE", "DOC_UPDATED", "DOC_CREATED"]).describe("操作类型"),
      targetType: z.string().describe("目标类型，如 'COMPONENT', 'API', 'ROUTE', 'STORE', 'CONFIG', 'DOC'"),
      targetId: z.string().optional().describe("目标标识，如文件路径 'src/views/Home/Index.vue'"),
      reason: z.string().optional().describe("操作原因"),
      planName: z.string().optional().describe("关联的 Plan 文档名（不含路径），如 'user-list-pagination-plan-v1.md'。不指定则自动查找最近的 Plan"),
    },
  },
  async (args: { action: string; targetType: string; targetId?: string; reason?: string; planName?: string }) => {
    try {
      const { action, targetType, targetId, reason, planName } = args

      let planFile: string | null = null
      const plansDir = join(PROJECT_ROOT, ".kimi-code", "plans")

      if (existsSync(plansDir)) {
        const files = await findFilesRecursive(plansDir, /\.md$/, 5)
        if (files.length > 0) {
          if (planName) {
            // 在嵌套目录中精确匹配 Plan 文件名
            planFile = files.find(f => basename(f) === planName) || null
          }
          if (!planFile) {
            // 自动查找最近修改的 Plan 文件（排除纯审计日志文件）
            let latestFile: string | null = null
            let latestTime = 0
            for (const f of files) {
              try {
                const s = await stat(f)
                if (s.mtimeMs > latestTime) {
                  latestTime = s.mtimeMs
                  latestFile = f
                }
              } catch {
                // Ignore
              }
            }
            planFile = latestFile
          }
        }
      }

      const ts = formatLocalTime(new Date())
      const auditEntry = `| ${ts} | ${action} | ${targetType} | ${targetId || "-"} | ${reason || "-"} |`

      if (planFile) {
        // 追加到 Plan 文件末尾
        try {
          let content = await readFileSafe(planFile)
          if (!content) {
            content = "# Audit Log\n\n| 时间 | 操作 | 类型 | 目标 | 原因 |\n|------|------|------|------|------|\n"
          }

          if (!content.includes("## 审计日志") && !content.includes("## Audit Log")) {
            content += "\n\n## 审计日志\n\n| 时间 | 操作 | 类型 | 目标 | 原因 |\n|------|------|------|------|------|\n"
          }

          content += auditEntry + "\n"
          await writeFile(planFile, content, "utf-8")

          const relPath = relative(PROJECT_ROOT, planFile)
          return textResponse(
            `✅ 开发操作已记录\n` +
            `  时间: ${ts}\n` +
            `  操作: ${action} ${targetType} ${targetId || ""}\n` +
            `  原因: ${reason || "无"}\n` +
            `  审计文件: ${relPath}`
          )
        } catch (writeError) {
          return errorResponse(`写入审计记录失败: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
        }
      }

      // 没有 Plan 文件，创建新的到今天的日期目录
      const now = new Date()
      const y = String(now.getFullYear())
      const m = String(now.getMonth() + 1).padStart(2, "0")
      const d = String(now.getDate()).padStart(2, "0")
      const todayDir = join(PROJECT_ROOT, ".kimi-code", "plans", y, m, d)
      // Ensure directory exists
      const { mkdir } = await import("fs/promises")
      await mkdir(todayDir, { recursive: true })
      const newPlanFile = join(todayDir, "audit-log.md")
      const header = "# 审计日志\n\n| 时间 | 操作 | 类型 | 目标 | 原因 |\n|------|------|------|------|------|\n"
      await writeFile(newPlanFile, header + auditEntry + "\n", "utf-8")

      return textResponse(
        `✅ 开发操作已记录（新建审计文件）\n` +
        `  时间: ${ts}\n` +
        `  操作: ${action} ${targetType} ${targetId || ""}\n` +
        `  审计文件: ${relative(PROJECT_ROOT, newPlanFile)}`
      )
    } catch (error) {
      return errorResponse(`记录开发操作失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 10: check_implementation_alignment ────────────────────

server.registerTool(
  "check_implementation_alignment",
  {
    description: "检查代码实现是否与 Spec 意图对齐（ADD-10，Step 3.5 落地）。读取 spec.md 中的功能意图，对比实际代码文件，检测语义漂移。AI 助手在编码完成后应调用此工具验证实现是否偏离需求。",
    inputSchema: {
      specPath: z.string().describe("Spec 文件路径（相对于 .kimi-code/specs/），如 'login-nav-decrypt/spec.md'"),
      codeFiles: z.array(z.string()).describe("要对比的代码文件路径列表（相对于项目根目录），如 ['src/views/login/index.vue', 'src/api/auth/index.ts']"),
    },
  },
  async (args: { specPath: string; codeFiles: string[] }) => {
    try {
      const { specPath, codeFiles } = args
      const specFullPath = join(PROJECT_ROOT, ".kimi-code", "specs", specPath)
      const specContent = await readFileSafe(specFullPath)

      if (!specContent) {
        return errorResponse(`未找到 Spec 文件: .kimi-code/specs/${specPath}`)
      }

      // 从 spec 中提取意图关键词（去除 markdown 格式，提取有意义的术语）
      const specLines = specContent.split("\n")
      const intentKeywords: string[] = []
      const featureTerms: string[] = []

      for (const line of specLines) {
        const trimmed = line.trim()
        // 提取标题作为功能名称
        if (trimmed.startsWith("#")) {
          const title = trimmed.replace(/^#+\s*/, "").trim()
          if (title.length > 2) featureTerms.push(title)
        }
        // 提取代码块中的接口/函数/类型名
        const codeRefMatch = trimmed.match(/`([^`]+)`/g)
        if (codeRefMatch) {
          for (const ref of codeRefMatch) {
            const clean = ref.replace(/`/g, "").trim()
            if (clean.length > 2 && !clean.includes("/") && !clean.includes(" ")) {
              intentKeywords.push(clean)
            }
          }
        }
        // 提取 API 路径
        const apiPathMatch = trimmed.match(/\/api\/[\w/-]+/g)
        if (apiPathMatch) {
          intentKeywords.push(...apiPathMatch)
        }
      }

      // 去重
      const uniqueKeywords = [...new Set(intentKeywords)]
      const uniqueFeatures = [...new Set(featureTerms)]

      // 读取并分析每个代码文件
      const fileReports: Array<{
        path: string
        exists: boolean
        keywordHits: string[]
        keywordMisses: string[]
        issues: string[]
      }> = []

      for (const codeFile of codeFiles) {
        const fullPath = join(PROJECT_ROOT, codeFile)
        const content = await readFileSafe(fullPath)

        if (!content) {
          fileReports.push({
            path: codeFile,
            exists: false,
            keywordHits: [],
            keywordMisses: uniqueKeywords,
            issues: [`❌ 文件不存在: ${codeFile} — Spec 中规划的文件未实现`],
          })
          continue
        }

        const hits: string[] = []
        const misses: string[] = []
        const issues: string[] = []

        // 检查关键词在代码中的出现
        for (const kw of uniqueKeywords) {
          if (content.includes(kw)) {
            hits.push(kw)
          } else {
            misses.push(kw)
          }
        }

        // 前端特化检查
        // 检查 Props 接口定义
        const propsMatch = content.match(/defineProps<([\s\S]*?)>/)
        if (propsMatch) {
          const propsContent = propsMatch[1]
          const specMentionsProps = uniqueKeywords.filter(kw =>
            specContent.toLowerCase().includes("props") && propsContent.includes(kw)
          )
          if (specMentionsProps.length > 0) {
            issues.push(`ℹ️ Props 接口中匹配到 Spec 术语: ${specMentionsProps.join(", ")}`)
          }
        }

        // 检查 API 调用是否存在
        const apiCalls = content.match(/(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi)
        if (apiCalls) {
          for (const call of apiCalls) {
            const url = call.match(/['"`]([^'"`]+)['"`]/)?.[1]
            if (url && uniqueKeywords.some(kw => kw.startsWith("/api/") && !url.includes(kw))) {
              // 只在 Spec 明确要求某 API 但代码用了不同 API 时报告
            }
          }
        }

        fileReports.push({
          path: codeFile,
          exists: true,
          keywordHits: hits,
          keywordMisses: misses,
          issues,
        })
      }

      // 生成报告
      const parts: string[] = [
        "=== ADD-10 实现对齐检查 ===",
        `Spec: .kimi-code/specs/${specPath}`,
        `功能: ${uniqueFeatures.slice(0, 3).join(" / ")}`,
        `检查文件: ${codeFiles.length} 个`,
        "",
      ]

      let totalIssues = 0
      let totalFiles = fileReports.length

      for (const report of fileReports) {
        parts.push(`--- ${report.path} ---`)
        if (!report.exists) {
          parts.push(...report.issues)
          totalIssues++
        } else {
          const hitRate = report.keywordHits.length / Math.max(uniqueKeywords.length, 1)
          const statusIcon = hitRate >= 0.6 ? "✅" : hitRate >= 0.3 ? "⚠️" : "❌"
          parts.push(`${statusIcon} Spec 术语匹配率: ${(hitRate * 100).toFixed(0)}% (${report.keywordHits.length}/${uniqueKeywords.length})`)
          if (report.keywordHits.length > 0) {
            parts.push(`  命中: ${report.keywordHits.slice(0, 10).join(", ")}`)
          }
          if (report.keywordMisses.length > 0 && report.keywordMisses.length <= 10) {
            parts.push(`  未命中: ${report.keywordMisses.join(", ")}`)
          }
          for (const issue of report.issues) {
            parts.push(issue)
            totalIssues++
          }
        }
        parts.push("")
      }

      // 总结
      parts.push("--- 总结 ---")
      if (totalIssues === 0) {
        parts.push("✅ 实现与 Spec 意图对齐良好")
      } else {
        parts.push(`⚠️ 发现 ${totalIssues} 个潜在漂移点，建议人工审查`)
      }
      parts.push("")
      parts.push("[T] 编译期验证：接口命名、组件 Props 是否出现在代码中")
      parts.push("[R] 运行时验证：需通过 Step 3.5 人工审查确认语义对齐")

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`检查实现对齐失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 11: scan_runtime_reviews ─────────────────────────────

server.registerTool(
  "scan_runtime_reviews",
  {
    description: "扫描运行时纠偏文档（ADD-11）。搜索 .kimi-code/reviews/ 下的 review-runtime 文件，提取未关闭的发现。AI 助手在 session-init 时应调用此工具检查是否有遗留的运行时问题需要处理。",
    inputSchema: {
      status: z.enum(["open", "closed", "all"]).optional().default("open").describe("过滤状态: 'open' 仅未关闭, 'closed' 仅已关闭, 'all' 全部"),
    },
  },
  async (args: { status?: string }) => {
    try {
      const { status = "open" } = args
      const reviewsDir = join(PROJECT_ROOT, ".kimi-code", "reviews")

      if (!existsSync(reviewsDir)) {
        return textResponse("=== ADD-11 运行时纠偏扫描 ===\n\n.kimi-code/reviews/ 目录不存在，无运行时纠偏文档。")
      }

      // 查找 review-runtime 文件
      const allFiles = await findFilesRecursive(reviewsDir, /review-runtime.*\.md$/, 2)

      if (allFiles.length === 0) {
        return textResponse("=== ADD-11 运行时纠偏扫描 ===\n\n未找到 review-runtime 文档，暂无运行时纠偏记录。")
      }

      const parts: string[] = [
        "=== ADD-11 运行时纠偏扫描 ===",
        `扫描目录: .kimi-code/reviews/`,
        `找到 ${allFiles.length} 个 review-runtime 文档`,
        "",
      ]

      let totalOpen = 0
      let totalClosed = 0
      const openFindings: Array<{ file: string; line: string }> = []

      for (const file of allFiles) {
        const content = await readFileSafe(file)
        if (!content) continue

        const relPath = relative(PROJECT_ROOT, file)
        const lines = content.split("\n")
        const fileFindings: { open: string[]; closed: string[] } = { open: [], closed: [] }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          // 匹配 checklist 格式的发现: - [ ] 或 - [x]
          const openMatch = line.match(/^-\s+\[\s\]\s+(.+)/)
          const closedMatch = line.match(/^-\s+\[x\]\s+(.+)/)

          if (openMatch) {
            fileFindings.open.push(openMatch[1].trim())
            openFindings.push({ file: relPath, line: openMatch[1].trim() })
          } else if (closedMatch) {
            fileFindings.closed.push(closedMatch[1].trim())
          }
        }

        totalOpen += fileFindings.open.length
        totalClosed += fileFindings.closed.length

        if (status === "all" || fileFindings.open.length > 0 || fileFindings.closed.length > 0) {
          parts.push(`--- ${relPath} ---`)
          parts.push(`  未关闭: ${fileFindings.open.length} | 已关闭: ${fileFindings.closed.length}`)

          if ((status === "open" || status === "all") && fileFindings.open.length > 0) {
            for (const finding of fileFindings.open) {
              parts.push(`  ⚠️ [未关闭] ${finding}`)
            }
          }
          if ((status === "closed" || status === "all") && fileFindings.closed.length > 0) {
            for (const finding of fileFindings.closed.slice(0, 5)) {
              parts.push(`  ✅ [已关闭] ${finding}`)
            }
            if (fileFindings.closed.length > 5) {
              parts.push(`  ... 共 ${fileFindings.closed.length} 个已关闭项`)
            }
          }
          parts.push("")
        }
      }

      // 总结
      parts.push("--- 总结 ---")
      parts.push(`未关闭发现: ${totalOpen} | 已关闭: ${totalClosed}`)
      if (totalOpen > 0) {
        parts.push("")
        parts.push("⚠️ 存在未关闭的运行时发现，建议优先处理：")
        for (const finding of openFindings.slice(0, 5)) {
          parts.push(`  - [${finding.file}] ${finding.line}`)
        }
      } else {
        parts.push("✅ 所有运行时发现均已关闭")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`扫描运行时纠偏文档失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 12: check_spec_drift ─────────────────────────────────

server.registerTool(
  "check_spec_drift",
  {
    description: "检测 Spec 与代码之间的漂移（ADD-12）。对比 spec.md 中关联的代码文件与 Spec 文件的最后修改时间，如果代码比 Spec 更新，说明发生了漂移。AI 助手在 Step 3.5 或 session-init 时应调用此工具。",
    inputSchema: {
      specPath: z.string().optional().describe("Spec 文件路径（相对于 .kimi-code/specs/），如 'login-nav-decrypt/spec.md'。不指定则扫描所有 Spec。"),
    },
  },
  async (args: { specPath?: string }) => {
    try {
      const { specPath } = args
      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")

      if (!existsSync(specsDir)) {
        return textResponse("=== ADD-12 Spec 漂移检测 ===\n\n.kimi-code/specs/ 目录不存在，无 Spec 文档。")
      }

      // 收集要检查的 spec 文件
      let specFiles: string[] = []
      if (specPath) {
        const fullPath = join(specsDir, specPath)
        if (existsSync(fullPath)) {
          specFiles.push(fullPath)
        } else {
          return errorResponse(`未找到 Spec 文件: .kimi-code/specs/${specPath}`)
        }
      } else {
        specFiles = await findFilesRecursive(specsDir, /spec\.md$/, 3)
      }

      if (specFiles.length === 0) {
        return textResponse("=== ADD-12 Spec 漂移检测 ===\n\n未找到 spec.md 文件。")
      }

      const parts: string[] = [
        "=== ADD-12 Spec 漂移检测 ===",
        `检查 Spec 文件: ${specFiles.length} 个`,
        "",
      ]

      let driftCount = 0
      let alignedCount = 0
      const driftedSpecs: Array<{ spec: string; files: string[] }> = []

      for (const specFile of specFiles) {
        const content = await readFileSafe(specFile)
        if (!content) continue

        const specStat = await stat(specFile).catch(() => null)
        if (!specStat) continue

        const specMtime = specStat.mtime
        const relSpecPath = relative(PROJECT_ROOT, specFile)

        // 从 spec 中提取关联的代码文件路径
        const codeRefs: string[] = []
        const lines = content.split("\n")
        for (const line of lines) {
          // 匹配 src/ 开头的路径引用
          const pathMatches = line.match(/src\/[\w/.-]+(?:\.(?:vue|ts|js|json))/g)
          if (pathMatches) {
            codeRefs.push(...pathMatches)
          }
          // 匹配 .kimi-code/specs/ 下的关联文件（tasks.md, checklist.md）
          const specDir = specFile.replace("/spec.md", "")
          const tasksFile = join(specDir, "tasks.md")
          const checklistFile = join(specDir, "checklist.md")
          // 不加入 codeRefs，这些是同目录文件
        }

        // 去重
        const uniqueCodeRefs = [...new Set(codeRefs)]

        if (uniqueCodeRefs.length === 0) {
          parts.push(`--- ${relSpecPath} ---`)
          parts.push(`  ℹ️ Spec 中未引用代码文件路径，跳过漂移检测`)
          parts.push("")
          continue
        }

        const driftedFiles: string[] = []
        const alignedFiles: string[] = []

        for (const codeRef of uniqueCodeRefs) {
          const codeFullPath = join(PROJECT_ROOT, codeRef)
          const codeStat = await stat(codeFullPath).catch(() => null)

          if (!codeStat) {
            // 文件不存在，不算漂移
            continue
          }

          if (codeStat.mtime > specMtime) {
            const diffMs = codeStat.mtime.getTime() - specMtime.getTime()
            const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(1)
            driftedFiles.push(`${codeRef}（比 Spec 新 ${diffHours}h）`)
          } else {
            alignedFiles.push(codeRef)
          }
        }

        if (driftedFiles.length > 0) {
          driftCount++
          driftedSpecs.push({ spec: relSpecPath, files: driftedFiles })
          parts.push(`--- ${relSpecPath} ---`)
          parts.push(`  ❌ 漂移: ${driftedFiles.length} 个文件比 Spec 更新`)
          for (const f of driftedFiles) {
            parts.push(`    - ${f}`)
          }
          if (alignedFiles.length > 0) {
            parts.push(`  ✅ 对齐: ${alignedFiles.length} 个文件`)
          }
          parts.push("")
        } else {
          alignedCount++
          parts.push(`--- ${relSpecPath} ---`)
          parts.push(`  ✅ 全部对齐 (${uniqueCodeRefs.length} 个代码文件)`)
          parts.push("")
        }
      }

      // 总结
      parts.push("--- 总结 ---")
      parts.push(`Spec 总数: ${specFiles.length} | 对齐: ${alignedCount} | 漂移: ${driftCount}`)

      if (driftCount > 0) {
        parts.push("")
        parts.push("⚠️ ADD-12 双源头漂移已发生，建议更新 Spec 文档以反映实际实现：")
        for (const d of driftedSpecs) {
          parts.push(`  - ${d.spec}: ${d.files.join(", ")}`)
        }
        parts.push("")
        parts.push("修复方式: 更新 spec.md 中对应章节，使文档与代码重新对齐")
      } else {
        parts.push("✅ 所有 Spec 与代码保持同步，未检测到漂移")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`检查 Spec 漂移失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: get_add_template ==========
server.registerTool(
  "get_add_template",
  {
    description: "获取 ADD 工作流的文档模板。ADD 范式要求每次生成文档产物前必须先读取对应模板，禁止凭记忆生成。\n\n可用模板（12 个）:\n- plan-template / add-route-template / add-route-template-heavyweight\n- spec-template / tasks-template / checklist-template\n- review-template / review-implementation-template / review-runtime-template\n- handoff-template / handoff-single-round-template / handoff-multi-round-template\n\n前端项目默认使用轻量 add-route 模板。",
    inputSchema: {
      template: z.string().describe("模板名称（不含 .md 后缀），如 'plan-template'。传 'list' 获取所有模板列表。"),
    },
  },
  async (args: { template: string }) => {
    try {
      const { template } = args
      if (!template) return errorResponse("template 参数不能为空")
      const templatesDir = join(PROJECT_ROOT, ".kimi-code", "templates")
      if (template === "list") {
        const entries = await readdir(templatesDir)
        const mdFiles = entries.filter(f => f.endsWith(".md"))
        const parts: string[] = [`=== ADD 模板列表（${mdFiles.length} 个） ===`, ""]
        for (const f of mdFiles) {
          const content = await readFileSafe(join(templatesDir, f))
          const firstLine = content?.split("\n")[0] || ""
          const title = firstLine.replace(/^#+\s*/, "").trim() || f
          parts.push(`  ${f.replace(".md", "")} — ${title}`)
        }
        parts.push("", '用法: get_add_template({ template: "plan-template" })')
        return textResponse(parts.join("\n"))
      }
      const fileName = template.endsWith(".md") ? template : `${template}.md`
      const filePath = join(templatesDir, fileName)
      if (!existsSync(filePath)) {
        return errorResponse(`未找到模板: ${fileName}\n可用模板请调用: get_add_template({ template: "list" })`)
      }
      const content = await readFile(filePath, "utf-8")
      return textResponse([
        `=== ADD 模板: ${fileName} ===`,
        `路径: .kimi-code/templates/${fileName}`, "",
        content, "",
        "=== 使用提示 ===",
        "1. 复制模板到目标路径，替换 {占位符} 为实际内容",
        "2. 禁止凭记忆生成——模板可能在迭代中已更新",
        "3. 生成文档后调用 record_dev_operation 记录",
      ].join("\n"))
    } catch (error) {
      return errorResponse(`获取 ADD 模板失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_route_status ==========
server.registerTool(
  "check_add_route_status",
  {
    description: "ADD 范式守卫工具：交叉校验 add-route 文件的存在性，并扫描文件内容统计 Step 完成度。\n必须在 Step 3 前调用。\n\n返回状态:\n- 'normal' — 文件存在且 Step 全部闭环\n- 'warn_step_incomplete' — 文件存在但有未勾选 Step\n- 'file_missing' — 文件不存在\n- 'never_generated' — 从未生成",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/plans/ 目录下匹配 *add-route* 文件"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      // 版本配对：同目录同基名 + 版本最高（0.3.39 口径，禁止取首个匹配）
      const matched = await resolveSiblingForKeyword(planKeyword, "add-route")
      const matchedFiles: string[] = matched ? [matched] : []

      const parts: string[] = [
        "=== ADD 守卫：add-route 存在性交叉校验 ===",
        `Plan 关键词: "${planKeyword}"`,
        `预期路径: .kimi-code/plans/{YYYY}/{MM}/{DD}/{需求域名}-{核心内容}-add-route-v1.md`, "",
      ]

      if (matchedFiles.length === 0) {
        parts.push("状态: ❌ never_generated — add-route 文件从未生成")
        parts.push("操作: 禁止进入 Step 3，强制回退至 Step 0.5 生成 add-route")
        parts.push("", "=== 必须执行的步骤 ===")
        parts.push("1. 回退到 Step 0.5（生成 ADD 执行路线图）")
        parts.push('2. 调用 get_add_template({ template: "add-route-template" }) 获取模板')
        parts.push("3. 按模板填充：元信息 + Step 状态 + Task 映射表 + ADD-7 审计策略")
        parts.push("4. 保存为 .kimi-code/plans/{YYYY}/{MM}/{DD}/{需求域名}-{核心内容}-add-route-v1.md")
        parts.push("5. 调用 record_dev_operation 记录创建事件")
        parts.push("6. 重新调用本工具验证")
        return errorResponse(parts.join("\n"))
      }

      // 文件存在，扫描 Step 完成度
      let stepTotal = 0, stepChecked = 0, stepUnchecked = 0
      const incompleteSteps: string[] = []
      const stepStatuses: Array<{ step: string; checked: number; unchecked: number }> = []
      try {
        const fullPath = matchedFiles[0] // already absolute from findFilesRecursive
        const routeContent = await readFileSafe(fullPath)
        if (routeContent) {
          let currentStepName = ""
          let stepC = 0, stepU = 0
          for (const line of routeContent.split("\n")) {
            const stepMatch = line.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/)
            if (stepMatch) {
              if (currentStepName && (stepC > 0 || stepU > 0)) {
                stepStatuses.push({ step: currentStepName, checked: stepC, unchecked: stepU })
              }
              currentStepName = stepMatch[1]; stepC = 0; stepU = 0; continue
            }
            const cbMatch = line.match(/^\s*-\s+\[([ xX])\]\s/)
            if (cbMatch) {
              stepTotal++
              if (cbMatch[1] === "x" || cbMatch[1] === "X") { stepChecked++; stepC++ }
              else { stepUnchecked++; stepU++; if (currentStepName && !incompleteSteps.includes(currentStepName)) incompleteSteps.push(currentStepName) }
            }
          }
          if (currentStepName && (stepC > 0 || stepU > 0)) stepStatuses.push({ step: currentStepName, checked: stepC, unchecked: stepU })
        }
      } catch { /* ignore scan errors */ }

      const isStepComplete = stepUnchecked === 0
      parts.push(`状态: ${isStepComplete ? "✅ normal" : "⚠️ warn_step_incomplete"} — add-route 文件存在${isStepComplete ? "且 Step 全部闭环" : "但存在未勾选 Step"}`)
      parts.push(`操作: ${isStepComplete ? "继续执行后续流程" : "⚠️ 建议先自检完成后再进入验收阶段"}`)
      parts.push("", "=== 匹配文件 ===")
      for (const f of matchedFiles) parts.push(`  ${relPath(f)}`)
      parts.push("")
      if (stepTotal > 0) {
        const rate = Math.round((stepChecked / stepTotal) * 100)
        parts.push("=== Step 完成度扫描 ===", `  整体: ${stepChecked}/${stepTotal} (${rate}%`)
        for (const s of stepStatuses) {
          parts.push(`  Step ${s.step}: ${s.unchecked === 0 ? "✅" : "⬜"} ${s.checked}/${s.checked + s.unchecked}`)
        }
        if (incompleteSteps.length > 0) {
          parts.push("", `  ⚠️ 未闭环 Step: ${incompleteSteps.join(", ")}`)
          parts.push("  建议: 调用 check_add_route_completeness 获取详细清单")
        }
      }
      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_add_route_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_route_completeness ==========
server.registerTool(
  "check_add_route_completeness",
  {
    description: "ADD 范式守卫工具：扫描 add-route 文件的 Step 完成度。\n统计每个 Step 的 [ ] 和 [x] 勾选数量，返回逐 Step 完成率。\n\n四种返回状态:\n- 'complete' — 全部 [x]，add-route 完整闭环\n- 'incomplete' — 存在未勾选项\n- 'file_missing' — 未找到文件\n- 'errors' — 解析出错\n\nStep 3 代码完成后、进入 Step 4 前必须调用。",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/plans/ 目录下匹配 *add-route* 文件"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      // 版本配对：同目录同基名 + 版本最高（0.3.39 口径）
      const matchedFile = await resolveSiblingForKeyword(planKeyword, "add-route")

      if (!matchedFile) {
        return errorResponse([
          "=== ADD 守卫：add-route Step 完成度扫描 ===",
          `状态: ❌ file_missing — 未找到 add-route 文件`,
          "操作: 回退至 Step 0.5 生成 add-route",
        ].join("\n"))
      }

      const content = await readFileSafe(matchedFile)
      if (!content) return errorResponse(`无法读取文件 ${matchedFile}`)

      const lines = content.split("\n")
      const stepHeaderRe = /^##\s+Step\s+(\d+(?:\.\d+)?)/
      const checkboxRe = /^\s*-\s+\[([ xX])\]\s/
      interface StepInfo { step: string; total: number; checked: number; unchecked: number; headerLine: number }
      const steps: StepInfo[] = []
      let currentStep: StepInfo | null = null
      let globalTotal = 0, globalChecked = 0, globalUnchecked = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const stepMatch = line.match(stepHeaderRe)
        if (stepMatch) {
          if (currentStep) steps.push(currentStep)
          currentStep = { step: stepMatch[1], total: 0, checked: 0, unchecked: 0, headerLine: i + 1 }
          continue
        }
        const cbMatch = line.match(checkboxRe)
        if (cbMatch) {
          globalTotal++
          if (cbMatch[1] === "x" || cbMatch[1] === "X") {
            globalChecked++; if (currentStep) { currentStep.checked++; currentStep.total++ }
          } else {
            globalUnchecked++; if (currentStep) { currentStep.unchecked++; currentStep.total++ }
          }
        }
      }
      if (currentStep) steps.push(currentStep)

      const rate = globalTotal > 0 ? Math.round((globalChecked / globalTotal) * 100) : 100
      const isComplete = globalUnchecked === 0
      const parts: string[] = [
        "=== ADD 守卫：add-route Step 完成度扫描 ===",
        `匹配文件: ${relPath(matchedFile)}`, "",
        `整体完成度: ${globalChecked}/${globalTotal} (${rate}%)`,
        `状态: ${isComplete ? "✅ complete" : "⚠️ incomplete"}`, "",
      ]
      if (steps.length > 0) {
        parts.push("| Step | 勾选 | 未勾选 | 完成率 |")
        parts.push("|------|------|--------|--------|")
        for (const s of steps) {
          const r = s.total > 0 ? Math.round((s.checked / s.total) * 100) : 100
          parts.push(`| Step ${s.step} | ${s.checked} | ${s.unchecked} | ${r}% |`)
        }
        parts.push("")
      }
      if (!isComplete) {
        const incomplete = steps.filter(s => s.unchecked > 0)
        parts.push("=== 未闭环 Step ===")
        for (const s of incomplete) parts.push(`  Step ${s.step}: ${s.unchecked} 项未完成 (L${s.headerLine})`)
        parts.push("", "操作: ⚠️ 回退完成未闭环 Step 后再调用本工具自检")
      } else {
        parts.push("=== 全部 Step 已闭环 ✅ ===")
      }
      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_add_route_completeness 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_handoff_status ==========
server.registerTool(
  "check_handoff_status",
  {
    description: "ADD 范式守卫工具：交叉校验 Handoff 交接文档的存在性。\n必须在 Step 0（文档先行）和 Step 8（收敛判断）中调用。\n\n返回状态:\n- 'normal' — Handoff 文件存在\n- 'file_missing' — Handoff 文件不存在\n- 'never_generated' — 从未生成",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/plans/ 目录下匹配 *handoff* 文件"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      // 版本配对：同目录同基名 + 版本最高（0.3.39 口径）
      const matched = await resolveSiblingForKeyword(planKeyword, "handoff")
      const matchedFiles: string[] = matched ? [matched] : []

      const parts: string[] = [
        "=== ADD 守卫：Handoff 存在性交叉校验 ===",
        `Plan 关键词: "${planKeyword}"`,
        `预期路径: .kimi-code/plans/{YYYY}/{MM}/{DD}/{任务名}/{需求域名}-{核心内容}-handoff-v1.md`, "",
      ]

      if (matchedFiles.length === 0) {
        parts.push("状态: ❌ never_generated — Handoff 交接文档从未生成")
        parts.push("操作: 禁止进入 Step 8，强制回退至 Step 0 创建 Handoff")
        parts.push("", "=== 必须执行的步骤 ===")
        parts.push("1. 回退到 Step 0（文档先行）")
        parts.push('2. 调用 get_add_template({ template: "handoff-single-round-template" }) 获取模板')
        parts.push("3. 按模板填充：交接前后状态 + 改动清单 + 回滚方案 + 执行步骤 + 后置确认")
        parts.push("4. 保存为 .kimi-code/plans/{YYYY}/{MM}/{DD}/{任务名}/{需求域名}-{核心内容}-handoff-v1.md")
        parts.push("5. 调用 record_dev_operation 记录创建事件")
        parts.push("6. 重新调用本工具验证")
        return errorResponse(parts.join("\n"))
      }

      // 检查 Handoff 内容完整性
      let hasPreState = false, hasPostState = false, hasChangeList = false, hasRollback = false, hasPostConfirm = false
      try {
        const content = await readFileSafe(matchedFiles[0])
        if (content) {
          hasPreState = /交接前状态/.test(content)
          hasPostState = /交接后状态/.test(content)
          hasChangeList = /改动清单/.test(content)
          hasRollback = /回滚/.test(content)
          hasPostConfirm = /后置确认/.test(content)
        }
      } catch { /* ignore */ }

      const allSectionsPresent = hasPreState && hasPostState && hasChangeList && hasRollback && hasPostConfirm
      parts.push(`状态: ${allSectionsPresent ? "✅ normal" : "⚠️ incomplete"} — Handoff 文件存在${allSectionsPresent ? "且章节完整" : "但章节不完整"}`)
      parts.push("", "=== 匹配文件 ===")
      for (const f of matchedFiles) parts.push(`  ${relPath(f)}`)
      parts.push("", "=== 章节完整性 ===")
      parts.push(`  交接前状态: ${hasPreState ? "✅" : "❌ 缺失"}`)
      parts.push(`  交接后状态: ${hasPostState ? "✅" : "❌ 缺失"}`)
      parts.push(`  改动清单: ${hasChangeList ? "✅" : "❌ 缺失"}`)
      parts.push(`  回滚方案: ${hasRollback ? "✅" : "❌ 缺失"}`)
      parts.push(`  后置确认: ${hasPostConfirm ? "✅" : "❌ 缺失"}`)

      if (!allSectionsPresent) {
        parts.push("", "操作: ⚠️ 建议补齐缺失章节后再进入 Step 8")
        return errorResponse(parts.join("\n"))
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_handoff_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_plan_status ==========
server.registerTool(
  "check_plan_status",
  {
    description: "ADD 范式守卫工具：交叉校验 Plan 文档的存在性和内容完整性。\n必须在 Step 0（文档先行）中调用。\n\n返回状态:\n- 'normal' — Plan 文件存在且章节完整\n- 'incomplete' — Plan 文件存在但章节不完整\n- 'file_missing' — Plan 文件不存在\n- 'never_generated' — 从未生成",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/plans/ 目录下匹配 *plan* 文件"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      // 版本配对：排除 .hitl / add-route / handoff / review / devlog 兄弟产物，版本最高者胜
      const plan = resolvePlanEntry(await listPlanEntries(), planKeyword)
      const matchedFiles: string[] = plan ? [plan.path] : []

      const parts: string[] = [
        "=== ADD 守卫：Plan 存在性交叉校验 ===",
        `Plan 关键词: "${planKeyword}"`,
        `预期路径: .kimi-code/plans/{YYYY}/{MM}/{DD}/{任务名}/{需求域名}-{核心内容}-plan-v1.md`, "",
      ]

      if (matchedFiles.length === 0) {
        parts.push("状态: ❌ never_generated — Plan 文档从未生成")
        parts.push("操作: 禁止进入 Step 1，强制回退至 Step 0 创建 Plan")
        parts.push("", "=== 必须执行的步骤 ===")
        parts.push("1. 回退到 Step 0（文档先行）")
        parts.push('2. 调用 get_add_template({ template: "plan-template" }) 获取模板')
        parts.push("3. 按模板填充：背景与目标 + 方案选型 + 架构设计 + 实施步骤 + 验收标准")
        parts.push("4. 保存为 .kimi-code/plans/{YYYY}/{MM}/{DD}/{任务名}/{需求域名}-{核心内容}-plan-v1.md")
        parts.push("5. 调用 record_dev_operation 记录创建事件")
        parts.push("6. 重新调用本工具验证")
        return errorResponse(parts.join("\n"))
      }

      // 检查 Plan 内容完整性
      let hasBackground = false, hasArchitecture = false, hasSteps = false, hasAcceptance = false
      try {
        const content = await readFileSafe(matchedFiles[0])
        if (content) {
          hasBackground = /背景与目标/.test(content)
          hasArchitecture = /架构设计/.test(content)
          hasSteps = /实施步骤/.test(content)
          hasAcceptance = /验收标准/.test(content)
        }
      } catch { /* ignore */ }

      const allSectionsPresent = hasBackground && hasArchitecture && hasSteps && hasAcceptance
      parts.push(`状态: ${allSectionsPresent ? "✅ normal" : "⚠️ incomplete"} — Plan 文件存在${allSectionsPresent ? "且章节完整" : "但章节不完整"}`)
      parts.push("", "=== 匹配文件 ===")
      for (const f of matchedFiles) parts.push(`  ${relPath(f)}`)
      parts.push("", "=== 章节完整性 ===")
      parts.push(`  背景与目标: ${hasBackground ? "✅" : "❌ 缺失"}`)
      parts.push(`  架构设计: ${hasArchitecture ? "✅" : "❌ 缺失"}`)
      parts.push(`  实施步骤: ${hasSteps ? "✅" : "❌ 缺失"}`)
      parts.push(`  验收标准: ${hasAcceptance ? "✅" : "❌ 缺失"}`)

      if (!allSectionsPresent) {
        parts.push("", "操作: ⚠️ 建议补齐缺失章节后再进入 Step 1")
        return errorResponse(parts.join("\n"))
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_plan_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_specs_status ==========
server.registerTool(
  "check_specs_status",
  {
    description: "ADD 范式守卫工具：交叉校验 Specs 三元组（spec.md + tasks.md + checklist.md）的存在性和完整性。\n必须在 Step 2（创建 Specs）和 Step 3（实现前）调用。\n\n返回状态:\n- 'complete' — 三元组完整（三个文件均存在）\n- 'incomplete' — 三元组不完整（缺少某些文件）\n- 'never_generated' — 从未生成",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/specs/ 目录下匹配对应的 specs 目录"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")
      const planLower = planKeyword.toLowerCase()

      let matchedDirs: string[] = []
      try {
        const allSpecs = await findFilesRecursive(specsDir, /spec\.md$/, 5)
        for (const fullPath of allSpecs) {
          const dirName = basename(dirname(fullPath))
          if (dirName.toLowerCase().includes(planLower) || fullPath.toLowerCase().includes(planLower)) {
            matchedDirs.push(dirname(fullPath))
          }
        }
      } catch { /* specs 目录不存在 */ }

      const parts: string[] = [
        "=== ADD 守卫：Specs 三元组存在性交叉校验 ===",
        `Plan 关键词: "${planKeyword}"`,
        `预期路径: .kimi-code/specs/{YYYY}/{MM}/{DD}/{任务名}/ (spec.md + tasks.md + checklist.md)`, "",
      ]

      if (matchedDirs.length === 0) {
        parts.push("状态: ❌ never_generated — Specs 三元组从未生成")
        parts.push("操作: 禁止进入 Step 3，强制回退至 Step 2 创建 Specs")
        parts.push("", "=== 必须执行的步骤 ===")
        parts.push("1. 回退到 Step 2（创建 Specs 三元组）")
        parts.push("2. 按项目规范创建目录: .kimi-code/specs/{YYYY}/{MM}/{DD}/{任务名}/")
        parts.push("3. 创建 spec.md（Why / What Changes / Requirements / Boundaries）")
        parts.push("4. 创建 tasks.md（Task 清单 + 依赖拓扑）")
        parts.push("5. 创建 checklist.md（验收清单 + [T] 编译期 + [R] 运行时）")
        parts.push("6. 调用 record_dev_operation 记录创建事件")
        parts.push("7. 重新调用本工具验证")
        return errorResponse(parts.join("\n"))
      }

      // 检查三元组完整性
      const specDir = matchedDirs[0]
      const hasSpec = existsSync(join(specDir, "spec.md"))
      const hasTasks = existsSync(join(specDir, "tasks.md"))
      const hasChecklist = existsSync(join(specDir, "checklist.md"))
      const allComplete = hasSpec && hasTasks && hasChecklist

      parts.push(`状态: ${allComplete ? "✅ complete" : "⚠️ incomplete"} — Specs 三元组${allComplete ? "完整" : "不完整"}`)
      parts.push("", "=== 匹配目录 ===")
      parts.push(`  ${relative(specsDir, specDir)}/`)
      parts.push("", "=== 三元组完整性 ===")
      parts.push(`  spec.md: ${hasSpec ? "✅" : "❌ 缺失"}`)
      parts.push(`  tasks.md: ${hasTasks ? "✅" : "❌ 缺失"}`)
      parts.push(`  checklist.md: ${hasChecklist ? "✅" : "❌ 缺失"}`)

      if (!allComplete) {
        parts.push("", "操作: ⚠️ 补齐缺失文件后再进入 Step 3")
        return errorResponse(parts.join("\n"))
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_specs_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_dps ==========
server.registerTool(
  "check_dps",
  {
    description: "ADD 范式上游文档质量量化工具（Documentation Precision Score）。\n在 Step 0 末尾调用，评估 Plan → Review → Specs 三级文档精确度。\n\n四维评分（各 25%）：Plan 可执行粒度 / Review 覆盖完备度 / Specs 精确度 / Review 回流完整度\n\nDPS ≥ 80 → 🟢 进入 Step 1\nDPS 65-79 → 🟡 回退补齐\nDPS < 70 → 🔴 回退细化 Plan",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 .kimi-code/plans/ 目录下匹配 Plan 和关联的 Review、Specs"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      const plansDir = join(PROJECT_ROOT, ".kimi-code", "plans")
      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")
      const reviewsDir = join(PROJECT_ROOT, ".kimi-code", "reviews")
      const planLower = planKeyword.toLowerCase()

      // 1. 查找 Plan 文件（版本配对：同关键词取版本最高，排除兄弟产物）
      const planEntry = resolvePlanEntry(await listPlanEntries(), planKeyword)
      const planFile: string | null = planEntry?.path ?? null
      const planContent = planFile ? (await readFileSafe(planFile)) ?? "" : ""

      // 2. 查找 Review 文件（递归子目录，兼容 ADD-8 {YYYY}/{MM}/{DD}/{任务名}/ 分层）
      let reviewContent = ""
      try {
        const allReviews = await findFilesRecursive(reviewsDir, /\.md$/, 5)
        for (const fullPath of allReviews) {
          const e = basename(fullPath)
          if (e.toLowerCase().includes(planLower) && e.toLowerCase().includes("review")) {
            reviewContent = (await readFileSafe(fullPath)) || ""; break
          }
        }
      } catch { /* ignore */ }

      // 3. 查找 Specs
      let specContent = ""
      try {
        const allSpecs = await findFilesRecursive(specsDir, /spec\.md$/, 5)
        for (const fullPath of allSpecs) {
          const dirName = basename(dirname(fullPath))
          if (dirName.toLowerCase().includes(planLower) || fullPath.toLowerCase().includes(planLower)) {
            specContent = (await readFileSafe(fullPath)) || ""; break
          }
        }
      } catch { /* ignore */ }

      // 4. 评分
      let planScore = 50, reviewScore = 50, specScore = 50, refluxScore = 50
      // Plan 可执行粒度
      if (planFile) {
        if (/##\s+一、/.test(planContent)) planScore += 10
        if (/##\s+三、架构设计/.test(planContent)) planScore += 10
        if (/验收标准/.test(planContent)) planScore += 10
        if (/\[ \]/.test(planContent)) planScore += 10
        if (/add-route/.test(planContent)) planScore += 10
      } else { planScore = 0 }
      // Review 覆盖度
      if (reviewContent) {
        if (/总体结论/.test(reviewContent)) reviewScore += 10
        if (/问题清单/.test(reviewContent)) reviewScore += 10
        if (/影响评估/.test(reviewContent)) reviewScore += 10
        if (/建议修正优先级/.test(reviewContent)) reviewScore += 10
        if (/P[012]/.test(reviewContent)) reviewScore += 10
      } else { reviewScore = 30 }
      // Specs 精确度
      if (specContent) {
        if (/## Why/.test(specContent)) specScore += 10
        if (/## What Changes/.test(specContent)) specScore += 10
        if (/## Requirements/.test(specContent)) specScore += 10
        if (/WHEN.*THEN|THEN.*WHEN/is.test(specContent)) specScore += 10
        if (/## Boundaries/.test(specContent)) specScore += 10
      } else { specScore = 0 }
      // Review 回流完整度
      if (reviewContent && planContent) {
        const p0Matches = reviewContent.match(/P0/g) || []
        if (p0Matches.length === 0) refluxScore = 80
        else if (planContent.length > reviewContent.length * 0.5) refluxScore = 75
        else refluxScore = 50
      }

      const dps = Math.round(planScore * 0.25 + reviewScore * 0.25 + specScore * 0.25 + refluxScore * 0.25)
      const icon = dps >= 80 ? "🟢" : dps >= 65 ? "🟡" : "🔴"
      const action = dps >= 80 ? "可进入 Step 1" : dps >= 65 ? "回退补齐短板" : "回退细化 Plan"

      const parts = [
        "=== DPS 上游文档质量闸门 ===",
        `Plan 关键词: "${planKeyword}"`,
        `Plan: ${planFile || "❌ 未找到"}`,
        `Review: ${reviewContent ? "✅ 已找到" : "❌ 未找到"}`,
        `Specs: ${specContent ? "✅ 已找到" : "❌ 未找到"}`, "",
        `| 维度 | 得分 |`,
        `|------|------|`,
        `| Plan 可执行粒度 | ${planScore} |`,
        `| Review 覆盖完备度 | ${reviewScore} |`,
        `| Specs 精确度 | ${specScore} |`,
        `| Review 回流完整度 | ${refluxScore} |`,
        `| **DPS 总分** | **${dps}** |`, "",
        `${icon} DPS = ${dps} → ${action}`,
      ]
      if (dps < 80) {
        parts.push("", "=== 改进建议 ===")
        if (planScore < 70) parts.push("- Plan: 补充架构设计章节、验收标准、add-route 引用")
        if (reviewScore < 70) parts.push("- Review: 补充问题清单、影响评估、优先级分级")
        if (specScore < 70) parts.push("- Specs: 补充 Why/What Changes/Requirements/Boundaries")
        if (refluxScore < 70) parts.push("- 回流: 将 Review P0/P1 问题的修复建议写回 Plan/Specs")
      }
      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_dps 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_rahs ==========
server.registerTool(
  "check_rahs",
  {
    description: "ADD 范式轮次注意力健康度量工具（Round Attention Health Score）。\n在 Step 4/8 调用，量化本轮实现健康度。\n\n五维评分：范围保真度(30%) / 类型安全(20%) / 审计完整度(25%) / Spec合规(15%) / 阶段对称性(10%)\n\nRAHS ≥ 90 → 🟢 健康\nRAHS 70-89 → 🟡 亚健康\nRAHS < 70 → 🔴 漂移，强制返工",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于定位 add-route 和关联的 specs"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")
      const plansDir = join(PROJECT_ROOT, ".kimi-code", "plans")
      const planLower = planKeyword.toLowerCase()

      // 1. 查找 add-route 文件（版本配对：同目录同基名 + 版本最高），提取计划文件清单
      let plannedFiles: string[] = []
      let addRouteExists = false
      try {
        const addRoute = await resolveSiblingForKeyword(planKeyword, "add-route")
        if (addRoute) {
          addRouteExists = true
          const content = await readFileSafe(addRoute)
          if (content) {
            const fileMatches = content.match(/src\/[\w\-/.]+\.(ts|vue|tsx)/g)
            if (fileMatches) plannedFiles = [...new Set(fileMatches)]
          }
        }
      } catch { /* ignore */ }

      // 2. 评分
      let scopeScore = 50, typeScore = 80, auditScore = 50, specScore = 50, phaseScore = 70

      // 范围保真度 (30%): 有 add-route + 计划文件清单
      if (addRouteExists) scopeScore += 30
      if (plannedFiles.length > 0) scopeScore += 20

      // 类型安全 (20%): 默认 80，如有 tsc 错误会下降
      // （前端项目无法在 MCP 内运行 tsc，给默认分）

      // 审计完整度 (25%): 检查 record_dev_operation 记录
      try {
        const allTasks = await findFilesRecursive(join(PROJECT_ROOT, ".kimi-code", "specs"), /tasks\.md$/, 5)
        for (const fullPath of allTasks) {
          const dirName = basename(dirname(fullPath))
          if (dirName.toLowerCase().includes(planLower) || fullPath.toLowerCase().includes(planLower)) {
            const tasksContent = await readFileSafe(fullPath)
            if (tasksContent) {
              const checkedTasks = (tasksContent.match(/- \[x\]/g) || []).length
              const totalTasks = (tasksContent.match(/- \[[ xX]\]/g) || []).length
              if (totalTasks > 0) auditScore = Math.round((checkedTasks / totalTasks) * 100)
            }
            break
          }
        }
      } catch { /* ignore */ }

      // Spec 合规 (15%): 检查 spec 文件存在性（递归子目录，兼容 ADD-8 分层）
      try {
        const allSpecs = await findFilesRecursive(join(PROJECT_ROOT, ".kimi-code", "specs"), /\.md$/, 5)
        for (const fullPath of allSpecs) {
          if (fullPath.toLowerCase().includes(planLower)) { specScore = 80; break }
        }
      } catch { /* ignore */ }

      // 阶段对称性 (10%): 默认 70

      const rahs = Math.round(
        scopeScore * 0.30 + typeScore * 0.20 + auditScore * 0.25 + specScore * 0.15 + phaseScore * 0.10
      )
      const icon = rahs >= 90 ? "🟢" : rahs >= 70 ? "🟡" : "🔴"
      const action = rahs >= 90 ? "健康，进入下一 Step" : rahs >= 70 ? "亚健康，自检后决定" : "漂移，强制返工 Step 3"

      const parts = [
        "=== RAHS 下游执行健康度 ===",
        `Plan 关键词: "${planKeyword}"`,
        `add-route: ${addRouteExists ? "✅ 存在" : "❌ 未找到"}`,
        `计划文件数: ${plannedFiles.length}`, "",
        `| 维度 | 权重 | 得分 |`,
        `|------|------|------|`,
        `| 范围保真度 | 30% | ${scopeScore} |`,
        `| 类型安全 | 20% | ${typeScore} |`,
        `| 审计完整度 | 25% | ${auditScore} |`,
        `| Spec 合规 | 15% | ${specScore} |`,
        `| 阶段对称性 | 10% | ${phaseScore} |`,
        `| **RAHS 总分** | **100%** | **${rahs}** |`, "",
        `${icon} RAHS = ${rahs} → ${action}`,
      ]
      if (rahs < 90) {
        parts.push("", "=== 改进建议 ===")
        if (scopeScore < 70) parts.push("- 范围: 检查 add-route 文件是否存在，确认计划文件清单完整")
        if (auditScore < 70) parts.push("- 审计: 完成 tasks.md 中的未勾选项，调用 record_dev_operation 补记录")
        if (specScore < 70) parts.push("- Spec: 确认 specs 目录中存在对应的 spec.md")
      }
      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_rahs 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: get_spec_context ==========
server.registerTool(
  "get_spec_context",
  {
    description: "获取 .kimi-code/specs/ 下指定任务的 specs 三元组上下文（spec.md + tasks.md + checklist.md）。ADD 工作流中每个原子事务对应一个 specs 三元组目录，形成「需求→执行→验收」闭环。\n\nAI 助手在 ADD 范式 Step 3 执行业务逻辑时，应调用此工具获取当前任务的 spec/tasks/checklist 上下文，确保实现与规格一致。",
    inputSchema: {
      task: z.string().describe("任务名（即 .kimi-code/specs/ 下的目录名），如 'co-agent-response-strategy'。传 'list' 获取所有任务列表。"),
      file: z.string().optional().describe("指定读取三元组中的某个文件: 'spec', 'tasks', 'checklist'。不传则返回全部三个文件。"),
    },
  },
  async (args: { task: string; file?: string }) => {
    try {
      const { task, file } = args
      if (!task) return errorResponse("task 参数不能为空")

      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")

      if (task === "list") {
        const allSpecs = await findFilesRecursive(specsDir, /spec\.md$/, 5)
        const taskDirs = [...new Set(allSpecs.map(f => dirname(f)))]
        const parts: string[] = [
          `=== Specs 任务列表（${taskDirs.length} 个） ===`,
          "",
        ]
        for (const dir of taskDirs) {
          const content = await readFileSafe(join(dir, "spec.md"))
          const firstLine = content?.split("\n")[0] || ""
          const title = firstLine.replace(/^#+\s*/, "").trim() || basename(dir)
          // 检查三元组完整性
          const hasTasks = existsSync(join(dir, "tasks.md"))
          const hasChecklist = existsSync(join(dir, "checklist.md"))
          const status = (hasTasks && hasChecklist) ? "✅" : "⚠️ 不完整"
          parts.push(`  ${status} ${relative(specsDir, dir)} — ${title}`)
        }
        parts.push("")
        parts.push('用法: get_spec_context({ task: "co-agent-response-strategy" })')
        return textResponse(parts.join("\n"))
      }

      const taskDir = join(specsDir, task)
      if (!existsSync(taskDir)) {
        return errorResponse(
          `未找到 specs 任务: ${task}\n` +
          `可用任务请调用: get_spec_context({ task: "list" })`
        )
      }

      const trinityFiles: Record<string, string> = {
        spec: "spec.md",
        tasks: "tasks.md",
        checklist: "checklist.md",
      }

      const parts: string[] = [
        `=== Specs 三元组: ${task} ===`,
        `路径: .kimi-code/specs/${task}/`,
        "",
      ]

      if (file && trinityFiles[file]) {
        // 只读取指定文件
        const filePath = join(taskDir, trinityFiles[file])
        const content = await readFileSafe(filePath)
        if (content) {
          parts.push(`=== ${trinityFiles[file]} ===`)
          parts.push(content)
        } else {
          parts.push(`⚠️ ${trinityFiles[file]} 不存在`)
        }
      } else {
        // 读取全部三个文件
        for (const [key, fileName] of Object.entries(trinityFiles)) {
          const filePath = join(taskDir, fileName)
          const content = await readFileSafe(filePath)
          if (content) {
            parts.push(`=== ${fileName} ===`)
            parts.push(content)
            parts.push("")
          } else {
            parts.push(`⚠️ ${fileName} 不存在（三元组不完整）`)
            parts.push("")
          }
        }
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 Spec 上下文失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_compliance ==========
server.registerTool(
  "check_add_compliance",
  {
    description: "综合 ADD 合规检查（ADD-1~6 一键验证）。对给定的 TypeScript 代码文件执行以下检查:\n1. ADD-2 阶段标记对称性（auditPhaseStart/End 配对 或 event-based 审计调用一致性）\n2. ADD-6 失败路径审计信息密度（catch 块 vs try 块）\n3. ADD-3 最小可观测单元（循环体内是否有审计调用）\n4. ADD-1 审计基础设施优先（是否导入了审计日志器）\n5. ADD-4 双通道输出（Layer 1 + Layer 2 导入完整性）\n\nAI 助手在 ADD 范式 Step 4（审计数据验证）和 Step 5（AI 自动合规检查）中应调用此工具。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
      featureName: z.string().optional().describe("功能名称（用于识别对应的审计日志器导入），如 'knowledgeBase'"),
      projectPattern: z.string().optional().default("event-based").describe("项目审计模式: 'phase-marker' (auditPhaseStart/End), 'event-based' (默认, agentAudit() / 自定义审计函数)"),
    },
  },
  async (args: { code: string; featureName?: string; projectPattern?: string }) => {
    try {
      const { code, featureName, projectPattern = "event-based" } = args
      if (!code) return errorResponse("code 参数不能为空")

      const isEventBased = projectPattern === "event-based"

      const lines: string[] = [
        "=== ADD 综合合规检查 ===",
        `  审计模式: ${isEventBased ? "event-based (agentAudit)" : "phase-marker (auditPhaseStart/End)"}`,
        "",
      ]

      let passCount = 0
      let failCount = 0
      let warnCount = 0

      // === 检查 1: ADD-2 阶段标记对称性 ===
      let starts: string[] = []
      let ends: string[] = []
      let m

      if (isEventBased) {
        // event-based 模式: 检测 agentAudit() / xxxAudit() 调用
        const auditCallRegex = /(?:agentAudit|\w+Audit)\s*\(\s*["']([^"']+)["']/g
        while ((m = auditCallRegex.exec(code)) !== null) starts.push(m[1])
      } else {
        const startRegex = /auditPhaseStart\(["']([^"']+)["']/g
        const endRegex = /auditPhaseEnd\(["']([^"']+)["']/g
        while ((m = startRegex.exec(code)) !== null) starts.push(m[1])
        while ((m = endRegex.exec(code)) !== null) ends.push(m[1])
      }

      const startCounts: Record<string, number> = {}
      const endCounts: Record<string, number> = {}
      for (const s of starts) startCounts[s] = (startCounts[s] || 0) + 1
      for (const e of ends) endCounts[e] = (endCounts[e] || 0) + 1

      const allPhases = new Set([...Object.keys(startCounts), ...Object.keys(endCounts)])
      const asymmetricPhases: string[] = []
      allPhases.forEach((phase) => {
        const sc = startCounts[phase] || 0
        const ec = endCounts[phase] || 0
        if (sc !== ec) {
          asymmetricPhases.push(`  ❌ ${phase}: Start=${sc}, End=${ec}`)
        }
      })

      lines.push("--- ADD-2 阶段标记对称性 ---")
      if (isEventBased) {
        lines.push(`  审计调用总数: ${starts.length}`)
        if (starts.length > 0) {
          lines.push(`  ✅ 检测到 ${starts.length} 处审计函数调用 (event-based 模式)`)
          const phaseCounts: Record<string, number> = {}
          for (const s of starts) phaseCounts[s] = (phaseCounts[s] || 0) + 1
          lines.push(`  调用分布: ${Object.entries(phaseCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`)
          passCount++
        } else {
          lines.push("  ⚠️ 未检测到 agentAudit() / xxxAudit() 调用")
          warnCount++
        }
      } else {
        lines.push(`  Start 总数: ${starts.length}, End 总数: ${ends.length}`)
        if (asymmetricPhases.length === 0 && starts.length > 0) {
          lines.push("  ✅ 阶段标记完全对称")
          passCount++
        } else if (starts.length === 0) {
          lines.push("  ⚠️ 未检测到 auditPhaseStart/End 调用")
          warnCount++
        } else {
          lines.push(`  ❌ ${asymmetricPhases.length} 个不对称阶段:`)
          lines.push(...asymmetricPhases)
          failCount++
        }
      }
      lines.push("")

      // === 检查 2: ADD-6 失败路径信息密度 ===
      const sections = code.split(/catch\s*\(/)
      lines.push("--- ADD-6 失败路径审计信息密度 ---")
      if (sections.length <= 1) {
        lines.push("  ⚠️ 未检测到 try/catch 块")
        warnCount++
      } else {
        let allCatchPass = true
        for (let i = 1; i < sections.length; i++) {
          const catchBlock = sections[i]
          const catchEnd = catchBlock.indexOf("{")
          if (catchEnd === -1) continue

          const tryBlock = sections[i - 1]
          const tryExtraMatches = tryBlock.match(/extra[:\s]*\{[^}]*\}/g)
          const tryExtraFieldCount = tryExtraMatches
            ? tryExtraMatches.reduce((sum, mm) => sum + (mm.match(/\w+:/g)?.length || 0), 0)
            : 0

          const closeIdx = catchBlock.indexOf("}")
          const catchBody = catchBlock.slice(catchEnd, closeIdx + 1)
          const catchExtraMatches = catchBody.match(/extra[:\s]*\{[^}]*\}/g)
          const catchExtraFieldCount = catchExtraMatches
            ? catchExtraMatches.reduce((sum, mm) => sum + (mm.match(/\w+:/g)?.length || 0), 0)
            : 0

          const catchHasAudit = catchBody.includes("audit") || catchBody.includes("Audit")
          const catchInfoDensity = catchExtraFieldCount + (catchHasAudit ? 2 : 0)

          if (!catchHasAudit) {
            lines.push(`  ❌ Catch 块 #${i}: 缺少审计调用`)
            allCatchPass = false
          } else if (catchInfoDensity < tryExtraFieldCount) {
            lines.push(`  ❌ Catch 块 #${i}: 信息密度不足 (catch=${catchExtraFieldCount}, try=${tryExtraFieldCount})`)
            allCatchPass = false
          }
        }
        if (allCatchPass) {
          lines.push(`  ✅ 所有 ${sections.length - 1} 个 catch 块审计信息密度充足`)
          passCount++
        } else {
          failCount++
        }
      }
      lines.push("")

      // === 检查 3: ADD-3 最小可观测单元 ===
      lines.push("--- ADD-3 最小可观测单元 ---")
      const loopRegex = /for\s*\(|while\s*\(|\.forEach\s*\(|\.map\s*\(/g
      const loopCount = (code.match(loopRegex) || []).length
      if (loopCount === 0) {
        lines.push("  ⚠️ 未检测到循环体，跳过此项")
        warnCount++
      } else if (isEventBased) {
        // event-based 模式: 查找循环体内是否有审计调用（批次级别审计）
        const loopAuditRegex = /\b\w*Audit\s*\(["']/g
        const hasLoopAudit = loopAuditRegex.test(code)
        if (hasLoopAudit) {
          lines.push(`  ✅ 批次级审计调用检测通过 (event-based 模式)，循环数: ${loopCount}`)
          passCount++
        } else {
          lines.push(`  ⚠️ event-based 模式: ${loopCount} 个循环体，未检测到批次级审计调用。检查是否有批次级 agentAuditXxx() 包裹`)
          warnCount++
        }
      } else {
        const chunkRegex = /audit\(["']\w*_CHUNK/i
        const hasChunkAudit = chunkRegex.test(code)
        if (hasChunkAudit) {
          lines.push(`  ✅ 循环体内有审计调用（检测到 CHUNK 阶段），循环数: ${loopCount}`)
          passCount++
        } else {
          lines.push(`  ❌ 检测到 ${loopCount} 个循环体，但未发现循环内审计调用（CHUNK 阶段）`)
          failCount++
        }
      }
      lines.push("")

      // === 检查 4: ADD-1 审计基础设施导入 ===
      lines.push("--- ADD-1 审计基础设施导入 ---")
      let hasDevLoggerImport = false
      let hasRuntimeAuditImport = false

      if (isEventBased) {
        // event-based 模式: 检查 agentAudit 导入或 agent-audit-logger 导入
        hasDevLoggerImport = /from\s+["'].*agent-audit-logger["']/.test(code) || /import\s*\{\s*agentAudit\b/.test(code)
        hasRuntimeAuditImport = hasDevLoggerImport // event-based 模式通常二合一
      } else {
        hasDevLoggerImport = /from\s+["'].*dev-logger["']/.test(code) || /from\s+["'].*logger["']/.test(code)
        hasRuntimeAuditImport = /from\s+["'].*-audit["']/.test(code)
      }
      if (hasDevLoggerImport && hasRuntimeAuditImport) {
        if (isEventBased) {
          lines.push("  ✅ 审计基础设施导入完整 (event-based: agentAudit/agent-audit-logger)")
        } else {
          lines.push("  ✅ Layer 1 (dev-logger) + Layer 2 (runtime-audit) 导入完整")
        }
        passCount++
      } else if (hasDevLoggerImport) {
        lines.push(isEventBased
          ? "  ⚠️ 检测到 agentAudit 导入，确认审计覆盖完整"
          : "  ⚠️ 仅导入 Layer 1 (dev-logger)，缺少 Layer 2 (runtime-audit)"
        )
        warnCount++
      } else if (hasRuntimeAuditImport) {
        lines.push("  ⚠️ 仅导入 Layer 2 (runtime-audit)，缺少 Layer 1 (dev-logger)")
        warnCount++
      } else {
        lines.push(isEventBased
          ? "  ⚠️ 未检测到 agentAudit 导入 (event-based 模式)"
          : "  ❌ 未检测到审计日志器导入"
        )
        if (isEventBased) warnCount++
        else failCount++
      }
      lines.push("")

      // === 汇总 ===
      const total = passCount + failCount + warnCount
      lines.push("=== 合规检查汇总 ===")
      lines.push(`  总计 ${total} 项检查: ✅ 通过 ${passCount} | ❌ 不合规 ${failCount} | ⚠️ 警告 ${warnCount}`)
      if (failCount === 0) {
        lines.push("  🎉 ADD 合规检查全部通过（或仅有警告）")
      } else {
        lines.push("  ⚠️ 存在不合规项，请修正后重新检查")
      }
      lines.push("")
      lines.push("=== 修正建议 ===")
      if (failCount > 0) {
        lines.push("1. 补充缺失的 auditPhaseEnd 调用（ADD-2）")
        lines.push("2. 在 catch 块中添加与 try 块等价的信息密度（ADD-6）")
        lines.push("3. 在循环体内添加 CHUNK 阶段审计（ADD-3）")
        lines.push("4. 导入 dev-logger 和 runtime-audit 两个文件（ADD-1/4）")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`ADD 合规检查失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_spec_sync ==========
server.registerTool(
  "check_spec_sync",
  {
    description: "ADD 重型模式文档-代码交叉校验工具。扫描 Plan → tasks.md → checklist.md → git diff → ADD-7 审计记录，报告四者之间的不一致。用于重型 add-route 的 Step 3.5 / Step 4 / Step 8 验证并更新项目状态。轻量模式项目可跳过此工具。",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于定位 Plan 和关联的 specs 目录"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const plansDir = join(PROJECT_ROOT, ".kimi-code", "plans")
      const specsDir = join(PROJECT_ROOT, ".kimi-code", "specs")
      const lines: string[] = []
      lines.push("=== check_spec_sync 文档-代码交叉校验 ===")
      lines.push("")

      // 1. 查找 Plan 文件
      if (!existsSync(plansDir)) {
        return errorResponse(`plans 目录不存在: ${plansDir}`)
      }
      const planFiles = await findFilesRecursive(plansDir, /\.md$/, 5)
      // 版本配对：排除 .hitl / add-route / handoff / review / devlog，版本最高者胜（0.3.39 口径）
      const planEntry = resolvePlanEntry(await listPlanEntries(), args.planKeyword)
      if (!planEntry) {
        return errorResponse(`未找到匹配的 Plan 文件（关键词: ${args.planKeyword}）`)
      }
      const planMatch = planEntry.path
      const planPath = planMatch
      lines.push(`Plan: ${basename(planMatch)}`)

      // 2. 从 Plan 中提取关联的 spec 目录名
      const planContent = await readFileSafe(planPath)
      let specDirName = ""
      if (planContent) {
        const specMatch = planContent.match(/Spec:\s*\.kimi-code\/specs\/(.+)/)
        if (specMatch) specDirName = specMatch[1]
      }
      if (!specDirName) {
        const taskMatch = planContent?.match(/Tasks:\s*\.kimi-code\/specs\/(.+)/)
        if (taskMatch) specDirName = taskMatch[1]
      }
      if (!specDirName) {
        specDirName = basename(planMatch).replace(/-plan-v\d+\.md$/, "").replace(/-add-route-v\d+\.md$/, "")
      }
      // 引用可能指向具体文件（spec.md / tasks.md / checklist.md），统一收敛到目录
      specDirName = specDirName.replace(/\/+$/, "").replace(/\/(spec|tasks|checklist)\.md$/i, "").replace(/\/spec\.md$/i, "")
      lines.push(`Spec 目录: ${specDirName}`)
      lines.push("")

      // === Policy 读取：.kimi-code/sync-policy.json ===
      type CheckName = "tasks" | "checklist" | "handoff" | "addRoute" | "crossRef" | "rollback" | "gitDiff" | "auditLog"
      interface PolicyCheck { enabled: boolean; severity: "block" | "warn" | "info" }
      interface SyncPolicy { checks: Partial<Record<CheckName, PolicyCheck>> }
      const policyPath = join(PROJECT_ROOT, ".kimi-code", "sync-policy.json")
      let policy: SyncPolicy | null = null
      if (existsSync(policyPath)) {
        try {
          policy = JSON.parse(await readFileSafe(policyPath) || "{}")
          lines.push(`Policy: .kimi-code/sync-policy.json 已加载`)
        } catch {
          lines.push(`Policy: .kimi-code/sync-policy.json 解析失败，使用默认策略`)
        }
      }
      if (!policy) {
        const addRouteCandidate = basename(planMatch).replace(/-plan-v\d+\.md$/, "-add-route-v1.md")
        const hasAddRoute = existsSync(join(dirname(planMatch), addRouteCandidate))
        const isHeavy = hasAddRoute
        policy = {
          checks: isHeavy ? {
            tasks: { enabled: true, severity: "block" },
            checklist: { enabled: true, severity: "block" },
            handoff: { enabled: true, severity: "block" },
            addRoute: { enabled: true, severity: "warn" },
            crossRef: { enabled: true, severity: "warn" },
            rollback: { enabled: true, severity: "block" },
            gitDiff: { enabled: true, severity: "warn" },
            auditLog: { enabled: true, severity: "block" },
          } : {
            tasks: { enabled: true, severity: "block" },
            checklist: { enabled: true, severity: "block" },
            handoff: { enabled: false, severity: "warn" },
            addRoute: { enabled: false, severity: "warn" },
            crossRef: { enabled: false, severity: "warn" },
            rollback: { enabled: false, severity: "warn" },
            gitDiff: { enabled: true, severity: "warn" },
            auditLog: { enabled: true, severity: "warn" },
          }
        }
        lines.push(`Policy: 默认${isHeavy ? "重型" : "轻型"}策略（${isHeavy ? "发现 add-route" : "无 add-route"}）`)
      }
      const isEnabled = (name: CheckName) => policy!.checks[name]?.enabled !== false
      const isBlock = (name: CheckName) => policy!.checks[name]?.severity === "block"
      const isWarn = (name: CheckName) => policy!.checks[name]?.severity === "warn"
      const blockingFailures: string[] = []
      lines.push("")

      // 3. 读取 tasks.md
      let tasksContent = ""
      let uncheckedTasks = 0
      let checkedTasks = 0
      if (isEnabled("tasks")) {
        const tasksPath = join(specsDir, specDirName, "tasks.md")
        tasksContent = await readFileSafe(tasksPath) || ""
        if (tasksContent) {
          const unchecked = tasksContent.match(/^- \[ \] Task/gm)
          const checked = tasksContent.match(/^- \[x\] Task/gm)
          uncheckedTasks = unchecked ? unchecked.length : 0
          checkedTasks = checked ? checked.length : 0
          lines.push(`tasks.md: ${checkedTasks} 已完成 / ${uncheckedTasks} 未完成`)
          if (uncheckedTasks > 0 && isBlock("tasks")) blockingFailures.push("tasks.md 有未完成项")
        } else {
          lines.push(`tasks.md: 文件不存在`)
          if (isBlock("tasks")) blockingFailures.push("tasks.md 不存在")
        }
      } else {
        lines.push("tasks.md: 已禁用（policy）")
      }

      // 4. 读取 checklist.md
      let checklistContent = ""
      let uncheckedChecklist = 0
      let checkedChecklist = 0
      if (isEnabled("checklist")) {
        const checklistPath = join(specsDir, specDirName, "checklist.md")
        checklistContent = await readFileSafe(checklistPath) || ""
        if (checklistContent) {
          const unchecked = checklistContent.match(/^- \[ \] /gm)
          const checked = checklistContent.match(/^- \[x\] /gm)
          uncheckedChecklist = unchecked ? unchecked.length : 0
          checkedChecklist = checked ? checked.length : 0
          lines.push(`checklist.md: ${checkedChecklist} 已勾选 / ${uncheckedChecklist} 未勾选`)
          if (uncheckedChecklist > 0 && isBlock("checklist")) blockingFailures.push("checklist.md 有未勾选项")
        } else {
          lines.push(`checklist.md: 文件不存在`)
          if (isBlock("checklist")) blockingFailures.push("checklist.md 不存在")
        }
      } else {
        lines.push("checklist.md: 已禁用（policy）")
      }
      lines.push("")

      // 4.5. 扫描 Handoff 交接文档
      let hfUnchecked = -1
      let hfChecked = 0
      let hfPreChecksUnchecked = 0
      let hfPostChecksUnchecked = 0
      let handoffContent = ""
      let actualHandoffPath: string | null = null
      const handoffFileName = basename(planMatch).replace(/-plan-v\d+\.md$/, "-handoff-v1.md")
      if (isEnabled("handoff")) {
        const handoffPath = join(dirname(planMatch), handoffFileName)
        const hasVersionedVariant = specDirName ? `${specDirName}-handoff-v1.md` : null
        const hasUnversionedVariant = specDirName ? `${specDirName}-handoff.md` : null
        const allHandoffFiles = planFiles.filter(f => f.includes("handoff"))

        if (existsSync(handoffPath)) {
          actualHandoffPath = handoffPath
        } else if (hasVersionedVariant && existsSync(join(dirname(planMatch), hasVersionedVariant))) {
          actualHandoffPath = join(dirname(planMatch), hasVersionedVariant)
        } else if (hasUnversionedVariant && existsSync(join(dirname(planMatch), hasUnversionedVariant))) {
          actualHandoffPath = join(dirname(planMatch), hasUnversionedVariant)
        } else {
          actualHandoffPath = allHandoffFiles
            .find(p => {
              const filename = p.split("/").pop()?.toLowerCase() || ""
              return filename.includes(args.planKeyword.toLowerCase().replace(/\s+/g, "-"))
                || filename.includes(specDirName.toLowerCase())
            }) || null
        }
        if (actualHandoffPath) {
          handoffContent = await readFileSafe(actualHandoffPath) || ""
          if (handoffContent) {
            hfUnchecked = (handoffContent.match(/^- \[ \] /gm) || []).length
            hfChecked = (handoffContent.match(/^- \[x\] /gm) || []).length
            const hfPreSection = handoffContent.match(/执行前置检查[\s\S]*?(?=##\s|$)/)
            const hfPostSection = handoffContent.match(/后置确认[\s\S]*?(?=##\s|---|$)/)
            if (hfPreSection) {
              hfPreChecksUnchecked = (hfPreSection[0].match(/^- \[ \] /gm) || []).length
            }
            if (hfPostSection) {
              hfPostChecksUnchecked = (hfPostSection[0].match(/^- \[ \] /gm) || []).length
            }
            lines.push(`Handoff: ${hfChecked} 已勾选 / ${hfUnchecked} 未勾选（前置:${hfPreChecksUnchecked} 未完成, 后置:${hfPostChecksUnchecked} 未完成）`)
            if (hfUnchecked > 0 && isBlock("handoff")) blockingFailures.push("Handoff 有未勾选项")
          } else {
            lines.push("Handoff: 文件存在但无法读取")
          }
        } else {
          lines.push("Handoff: 未找到交接文档")
          if (isBlock("handoff")) blockingFailures.push("Handoff 文档不存在")
        }
      } else {
        lines.push("Handoff: 已禁用（policy）")
      }
      lines.push("")

      // 4.6. 扫描 add-route 残余 [ ] 项
      let arUnchecked = 0
      let arChecked = 0
      if (isEnabled("addRoute")) {
        const addRouteMatch = basename(planMatch).replace(/-plan-v\d+\.md$/, "-add-route-v1.md")
        let addRoutePath = join(dirname(planMatch), addRouteMatch)
        if (!existsSync(addRoutePath)) {
          const specAddRouteName = specDirName ? `${specDirName}-add-route-v1.md` : null
          if (specAddRouteName && existsSync(join(dirname(planMatch), specAddRouteName))) {
            addRoutePath = join(dirname(planMatch), specAddRouteName)
          } else {
            const foundByKeyword = planFiles
              .filter(f => f.includes("add-route"))
              .find(f => {
                const filename = f.toLowerCase()
                return filename.includes(args.planKeyword.toLowerCase().replace(/\s+/g, "-"))
                  || filename.includes(specDirName.toLowerCase())
              })
            if (foundByKeyword) {
              addRoutePath = foundByKeyword
            }
          }
        }
        if (existsSync(addRoutePath)) {
          const arContent = await readFileSafe(addRoutePath)
          if (arContent) {
            arUnchecked = (arContent.match(/^- \[ \] /gm) || []).length
            arChecked = (arContent.match(/^- \[x\] /gm) || []).length
            lines.push(`add-route: ${arChecked} 已勾选 / ${arUnchecked} 未勾选`)
            if (arUnchecked > 0 && isBlock("addRoute")) blockingFailures.push("add-route 有未勾选项")
          }
        } else {
          lines.push("add-route: 未找到")
        }
      } else {
        lines.push("add-route: 已禁用（policy）")
      }
      lines.push("")

      // 4.7. 反向引用检查
      let crossRefIssues: string[] = []
      if (isEnabled("crossRef")) {
        if (actualHandoffPath && handoffContent) {
          const targetPlanRefs = handoffContent.match(/\]\(([^\)]+)\)/g) || []
          for (const ref of targetPlanRefs.slice(0, 5)) {
            const planName = ref.replace(/^\]\(/, "").replace(/\)$/, "")
            if (!planName.endsWith("-plan-v1.md")) continue
            const planFile = planFiles.find(f => planName.endsWith(basename(f)))
            if (planFile) {
              const downstreamContent = await readFileSafe(planFile)
              if (downstreamContent) {
                const handoffShortName = actualHandoffPath.split("/").pop() || handoffFileName
                if (!downstreamContent.includes(handoffShortName)) {
                  crossRefIssues.push(`${planFile} 未反向引用 ${handoffShortName}`)
                }
              }
            }
          }
        }
        if (crossRefIssues.length > 0) {
          lines.push("=== 反向引用检查 ===")
          for (const issue of crossRefIssues) {
            lines.push(`  ⚠️ ${issue}`)
          }
          if (isBlock("crossRef")) blockingFailures.push("反向引用断裂")
        } else if (actualHandoffPath) {
          lines.push("=== 反向引用检查 ===")
          lines.push("  ✅ 下游 Plan 均正确引用了本 Handoff")
        }
      } else {
        lines.push("反向引用检查: 已禁用（policy）")
      }
      lines.push("")

      // 4.8. 回滚命令覆盖校验
      let rollbackIssues: string[] = []
      if (isEnabled("rollback")) {
        if (actualHandoffPath && handoffContent) {
          const changeTable = handoffContent.match(/## 3\. 改动清单[\s\S]*?(?=###|## 4\.)/)
          const filePathsInTable: string[] = []
          if (changeTable) {
            const pathMatches = Array.from(changeTable[0].matchAll(/`(src\/[^`]+)`/g))
            for (const m of pathMatches) {
              filePathsInTable.push(m[1])
            }
          }
          const rollbackSection = handoffContent.match(/### 代码回滚[\s\S]*?```bash([\s\S]*?)```/)
          const rollbackPaths: string[] = []
          if (rollbackSection) {
            const cmds = Array.from(rollbackSection[1].matchAll(/(?:git checkout --|git rm)\s+(\S+)/g))
            for (const m of cmds) {
              rollbackPaths.push(m[1].replace(/\\/g, ""))
            }
          }
          if (filePathsInTable.length > 0 && rollbackPaths.length > 0) {
            for (const fp of filePathsInTable) {
              const covered = rollbackPaths.some(rp => fp.endsWith(rp.replace(/^src\//, "")) || rp.endsWith(fp.replace(/^src\//, "")) || fp === rp)
              if (!covered) {
                rollbackIssues.push(`${fp} 在改动清单中但回滚方案未覆盖`)
              }
            }
          }
        }
        if (rollbackIssues.length > 0) {
          lines.push("=== 回滚命令覆盖校验 ===")
          for (const issue of rollbackIssues) {
            lines.push(`  ⚠️ ${issue}`)
          }
          if (isBlock("rollback")) blockingFailures.push("回滚方案覆盖不完整")
        } else if (actualHandoffPath && handoffContent) {
          lines.push("=== 回滚命令覆盖校验 ===")
          lines.push("  ✅ §3 改动清单与 §4 回滚方案完全一致")
        }
      } else {
        lines.push("回滚命令覆盖校验: 已禁用（policy）")
      }
      lines.push("")

      // 5. Git diff 统计
      let changedFiles: string[] = []
      if (isEnabled("gitDiff")) {
        const { execSync } = await import("child_process")
        try {
          // -z：NUL 分隔，git 永不为非 ASCII 路径加引号/八进制转义（0.3.39 修复）
          const diffStat = execSync("git diff --name-only -z", { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 5000 })
          changedFiles = diffStat.split("\0").map((s) => s.trim()).filter(Boolean)
        } catch {
          lines.push("Git diff: 无法获取（可能无 git 仓库或无暂存变更）")
        }
        lines.push(`Git diff 变更文件: ${changedFiles.length} 个`)
        for (const f of changedFiles.slice(0, 20)) {
          lines.push(`  ${f}`)
        }
        if (changedFiles.length > 20) lines.push(`  ... 还有 ${changedFiles.length - 20} 个文件`)
      } else {
        lines.push("Git diff: 已禁用（policy）")
      }
      lines.push("")

      // 6. 交叉比对
      if (isEnabled("gitDiff") && tasksContent && changedFiles.length > 0) {
        lines.push("=== 交叉比对：tasks.md 预期文件 vs git diff 实际变更 ===")
        const taskFileRefs = tasksContent.match(/`([^`]+\.ts[x]?)`/g) || []
        const expectedFiles = taskFileRefs.map(r => r.replace(/`/g, ""))
        let mismatchCount = 0
        for (const f of expectedFiles) {
          const found = changedFiles.some(cf => cf.endsWith(f.replace(/^src\//, "")) || cf === f)
          if (!found) {
            lines.push(`  ⚠️ tasks.md 提及但 git diff 未变更: ${f}`)
            mismatchCount++
          }
        }
        for (const cf of changedFiles) {
          if (cf.endsWith(".md") || cf.endsWith(".toml")) continue
          const mentioned = expectedFiles.some(ef => cf.endsWith(ef.replace(/^src\//, "")) || cf === ef)
          if (!mentioned) {
            lines.push(`  ⚠️ git diff 有变更但 tasks.md 未提及: ${cf}`)
            mismatchCount++
          }
        }
        if (mismatchCount === 0) {
          lines.push("  ✅ tasks.md 预期文件与 git diff 实际变更一致")
        }
        lines.push("")
      }

      // 7. 检查 ADD-7 审计记录（前端适配版：搜索 Plan 文件中的审计记录，替代 Prisma 查询）
      if (isEnabled("auditLog")) {
        const sourceFiles = changedFiles.filter(f => !f.endsWith(".md") && !f.endsWith(".toml"))
        let auditedCount = 0
        let missingAudit: string[] = []
        // 搜索 Plan 文件中的 record_dev_operation 记录
        const allPlanContent: string[] = []
        for (const pf of planFiles) {
          const content = await readFileSafe(pf)
          if (content) allPlanContent.push(content)
        }
        const combinedPlanText = allPlanContent.join("\n")
        for (const f of sourceFiles.slice(0, 10)) {
          const fileName = f.split("/").pop()?.replace(/\.(ts|tsx|vue)$/, "") || f
          const hasAudit = combinedPlanText.includes(fileName) || combinedPlanText.includes(f)
          if (hasAudit) {
            auditedCount++
          } else {
            missingAudit.push(f)
          }
        }
        lines.push("=== ADD-7 审计记录检查 ===")
        lines.push(`  已审计: ${auditedCount} / ${Math.min(sourceFiles.length, 10)} 个源文件（基于 Plan 文件搜索）`)
        if (missingAudit.length > 0) {
          lines.push(`  ⚠️ 缺少 ADD-7 记录的文件:`)
          for (const f of missingAudit) {
            lines.push(`    - ${f}`)
          }
          if (isBlock("auditLog")) blockingFailures.push("ADD-7 审计记录不完整")
        } else {
          lines.push("  ✅ 所有源文件均有 ADD-7 审计记录")
        }
      } else {
        lines.push("ADD-7 审计记录检查: 已禁用（policy）")
      }
      lines.push("")

      // 8. 综合建议 + 最终裁定
      lines.push("=== 综合同步建议 ===")
      if (uncheckedTasks > 0) {
        lines.push(`  📝 tasks.md 有 ${uncheckedTasks} 个未完成 Task，如已实现请勾选为 [x]`)
      }
      if (uncheckedChecklist > 0) {
        lines.push(`  📝 checklist.md 有 ${uncheckedChecklist} 个未勾选项，如已验证请勾选`)
      }
      if (hfUnchecked > 0) {
        lines.push(`  📝 Handoff 文档有 ${hfUnchecked} 个未勾选项（前置:${hfPreChecksUnchecked}, 后置:${hfPostChecksUnchecked}），如已验证请勾选`)
      }
      if (arUnchecked > 0) {
        lines.push(`  📝 add-route 文档有 ${arUnchecked} 个未勾选项，如已完成请勾选`)
      }
      if (crossRefIssues.length > 0) {
        lines.push(`  ⚠️ 反向引用断裂：${crossRefIssues.length} 个下游 Plan 未引用本 Handoff`)
      }
      if (rollbackIssues.length > 0) {
        lines.push(`  ⚠️ 回滚方案覆盖不完整：${rollbackIssues.length} 处不一致`)
      }
      if (uncheckedTasks === 0 && uncheckedChecklist === 0 && hfUnchecked === 0 && arUnchecked === 0 && crossRefIssues.length === 0 && rollbackIssues.length === 0) {
        lines.push("  ✅ tasks.md、checklist.md、Handoff 全部项已勾选")
      } else if (uncheckedTasks === 0 && uncheckedChecklist === 0) {
        lines.push("  ✅ tasks.md 和 checklist.md 全部项已勾选")
      }
      if (isEnabled("gitDiff") && changedFiles.length === 0) {
        lines.push("  ⚠️ git diff 无变更——可能所有变更已提交，或代码尚未实际修改")
      }

      // 最终裁定
      lines.push("")
      lines.push("=== 最终裁定 ===")
      if (blockingFailures.length > 0) {
        lines.push(`  ❌ BLOCKED — 以下阻断项必须修复后再收敛：`)
        for (const bf of blockingFailures) {
          lines.push(`    - ${bf}`)
        }
        lines.push(`  exitCode: 1`)
      } else {
        lines.push("  ✅ PASS — 所有 block 级检查通过")
        lines.push("  exitCode: 0")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`check_spec_sync 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Tool 25-27: HITL 审批（文件化，无 DB）────────────────────
// 无数据库实现：状态存 .kimi-code/hitl/{planName}.json，提案存 {planName}.hitl.md，
// 审批结果写哨兵 .kimi-code/hitl/.tongyi-{planName} / .bohui-{planName}
// （pre-tool-use hook §C 以哨兵文件为写入门禁，形成双通道校验）

const HITL_DIR = join(PROJECT_ROOT, ".kimi-code", "hitl")

interface HitlState {
  planName: string
  type: string
  round: number
  status: string
  createdAt: string
  approvedAt?: string
  rejectedAt?: string
  rejectReason?: string
  dimensions?: { name: string; content: string }[]
}

async function readHitlState(planName: string): Promise<HitlState | null> {
  try {
    const content = await readFile(join(HITL_DIR, `${planName}.json`), "utf-8")
    return JSON.parse(content) as HitlState
  } catch {
    return null
  }
}

async function writeHitlState(state: HitlState): Promise<void> {
  const { mkdir } = await import("fs/promises")
  await mkdir(HITL_DIR, { recursive: true })
  await writeFile(join(HITL_DIR, `${state.planName}.json`), JSON.stringify(state, null, 2), "utf-8")
}

// 与 pre-tool-use §C 的 _planName 剥离逻辑保持一致，哨兵双命名确保闸门命中
function hitlHookBase(planName: string): string {
  return planName
    .replace(/\.hitl$/, "")
    .replace(/-(plan|add-route|review)-v\d+$/, "")
    .replace(/-review-(implementation|runtime)$/, "")
}

const HITL_DEFAULT_DIMS = [
  { name: "影响模块", content: "" },
  { name: "预估文件数", content: "" },
  { name: "架构变更", content: "" },
  { name: "新增依赖", content: "" },
  { name: "风险等级", content: "" },
  { name: "预计轮次", content: "" },
  { name: "审计策略", content: "" },
  { name: "验收标准", content: "" },
]

server.registerTool(
  "create_hitl",
  {
    description:
      "HITL 审批：创建提案（文件化，无 DB）。写入 .kimi-code/hitl/{planName}.json（status=DRAFT，自动递增 round），并生成 {planName}.hitl.md 提案文件供人工审核。\n" +
      "Kimi Code 无弹框协议，交互流程：\n" +
      "1. 调用本工具传入 dimensions（LLM 根据对话动态生成决策维度）\n" +
      "2. 提示人类打开 .kimi-code/hitl/{planName}.hitl.md 逐项审核（或在对话中直接说同意/驳回）\n" +
      "3. 人类拍板后调用 update_hitl({ planName, type, status: \"TONGYI\"|\"BOHUI\", _fallback: true })\n" +
      "planName 示例: user-list-pagination-plan-v1\n" +
      "type: PLAN=计划审批, PLAN_REVIEW=方案评审",
    inputSchema: {
      planName: z.string().describe("Plan 名称，不含 .md 后缀"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).describe("审批类型"),
      dimensions: z
        .array(z.object({ name: z.string(), content: z.string().optional() }))
        .optional()
        .describe("决策维度列表（LLM 根据对话生成）。不传则按模板默认 8 维度"),
    },
  },
  async (args: { planName: string; type: string; dimensions?: { name: string; content?: string }[] }) => {
    try {
      const { planName, type } = args
      if (!planName) return errorResponse("planName 参数不能为空")

      const prev = await readHitlState(planName)
      const round = (prev?.round ?? 0) + 1
      const now = new Date()
      const isoNow = now.toISOString()

      const finalDims = (args.dimensions && args.dimensions.length > 0
        ? args.dimensions.map((d) => ({ name: d.name, content: d.content || "" }))
        : HITL_DEFAULT_DIMS
      ).map((d, i) => ({ name: d.name, content: d.content, order: i + 1 }))

      // 生成 hitl.md 提案文件
      const tableRows = finalDims.map((d) => `| ${d.order} | ${d.name} | ${d.content} | 同意/调整 |`).join("\n")
      const proposal = [
        `# ${planName} — HITL 提案 (round ${round})`,
        "",
        `> 创建: ${isoNow}  |  类型: ${type}  |  状态: DRAFT`,
        "",
        "## HITL 计划总览",
        "",
        "请填写以下决策维度，人工审核后调用 `update_hitl({ planName, type, status: \"TONGYI\"|\"BOHUI\", _fallback: true })` 完成审批：",
        "",
        "| # | 维度 | 方案内容 | 决策 |",
        "|---|------|----------|:----:|",
        tableRows,
        "",
        "## 审批结论",
        "",
        "> **tongyi**：方案通过，进入正式 Plan 生成。",
        "> **bohui**：方案驳回，需修正后重新 create_hitl 发起下一轮。",
        "",
        "| 时间 | 决策 | 原因 |",
        "|------|:----:|------|",
        "",
      ].join("\n")

      const { mkdir } = await import("fs/promises")
      await mkdir(HITL_DIR, { recursive: true })
      await writeFile(join(HITL_DIR, `${planName}.hitl.md`), proposal, "utf-8")

      const state: HitlState = {
        planName,
        type,
        round,
        status: "DRAFT",
        createdAt: isoNow,
        dimensions: finalDims.map((d) => ({ name: d.name, content: d.content })),
      }
      await writeHitlState(state)

      const lines = [
        `✅ create_hitl`,
        "",
        `planName: ${planName}`,
        `type:     ${type}`,
        `round:    ${round}`,
        `status:   DRAFT`,
        `proposal: .kimi-code/hitl/${planName}.hitl.md`,
        `dimensions: ${finalDims.length} 项`,
        "",
        "📋 请人工审核提案文件（或直接在对话中说 同意/驳回），然后调用:",
        `  update_hitl({ planName: "${planName}", type: "${type}", status: "TONGYI"|"BOHUI", _fallback: true })`,
      ]
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`create_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
)

server.registerTool(
  "update_hitl",
  {
    description:
      "HITL 审批：更新状态。DRAFT→TONGYI/BOHUI。\n" +
      "TONGYI 写哨兵 .kimi-code/hitl/.tongyi-{planName}（pre-tool-use hook §C 的写入门禁），BOHUI 写 .bohui-{planName}。\n" +
      "已终态（TONGYI/BOHUI）不可再更新，BOHUI 后需 create_hitl 新建 round。\n" +
      "Kimi Code 无弹框协议，使用 _fallback: true 直接以传入 status 更新。",
    inputSchema: {
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).describe("审批类型"),
      status: z.enum(["TONGYI", "BOHUI"]).describe("目标状态"),
      reason: z.string().optional().describe("驳回原因（BOHUI 时建议传）"),
      _fallback: z.boolean().optional().default(false).describe("降级模式：跳过弹框，直接以传入 status 更新（Kimi Code 环境默认使用）"),
    },
  },
  async (args: { planName: string; type: string; status: string; reason?: string; _fallback?: boolean }) => {
    try {
      const { planName, type, status, reason } = args
      const state = await readHitlState(planName)
      if (!state) {
        return errorResponse(`未找到 HITL 记录: ${planName}。请先调用 create_hitl({ planName: "${planName}", type: "${type}" })`)
      }
      if (state.status === "TONGYI" || state.status === "BOHUI") {
        return errorResponse(`HITL 已终态（${state.status}），不可再更新。BOHUI 后请用 create_hitl 新建 round。`)
      }
      if (status !== "TONGYI" && status !== "BOHUI") {
        return errorResponse(`status 必须是 TONGYI 或 BOHUI，收到: ${status}`)
      }

      const now = new Date()
      const isoNow = now.toISOString()
      if (status === "TONGYI") state.approvedAt = isoNow
      if (status === "BOHUI") {
        state.rejectedAt = isoNow
        if (reason) state.rejectReason = reason
      }
      state.status = status
      await writeHitlState(state)

      // 写哨兵（双命名：原始 planName + hook 剥离后缀推导名，保持 pre-tool-use §C 闸门一致）
      const { mkdir } = await import("fs/promises")
      await mkdir(HITL_DIR, { recursive: true })
      const hookBase = hitlHookBase(planName)
      const markerPrefix = status === "TONGYI" ? ".tongyi-" : ".bohui-"
      const markerNames = [...new Set([planName, hookBase])]
      const markerContent = [`status: ${status}`, `time: ${isoNow}`, reason ? `reason: ${reason}` : null].filter(Boolean).join("\n") + "\n"
      for (const n of markerNames) {
        await writeFile(join(HITL_DIR, markerPrefix + n), markerContent, "utf-8")
      }
      const marker = markerNames.map((n) => `.kimi-code/hitl/${markerPrefix}${n}`).join(", ")

      // 回写 hitl.md 提案文件状态（DRAFT → TONGYI/BOHUI）并追加审批结论行
      try {
        const proposalPath = join(HITL_DIR, `${planName}.hitl.md`)
        let proposal = await readFileSafe(proposalPath)
        if (proposal) {
          proposal = proposal.replace(/(状态:\s*)[A-Z_]+/, `$1${status}`)
          proposal += `| ${isoNow} | ${status} | ${reason || "—"} |\n`
          await writeFile(proposalPath, proposal, "utf-8")
        }
      } catch {
        // 提案文件回写失败不阻断主流程
      }

      const lines = [
        `✅ update_hitl`,
        "",
        `planName: ${planName}`,
        `type:     ${type}`,
        `round:    ${state.round}`,
        `status:   DRAFT → ${status}`,
        `marker:   ${marker}`,
      ]
      if (status === "BOHUI") {
        lines.push(`reason:   ${reason || "—"}`, "", `💡 驳回后请用 create_hitl 新建 round ${state.round + 1} 重新发起审批。`)
      }
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`update_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
)

server.registerTool(
  "status_hitl",
  {
    description:
      "HITL 审批：查询状态。返回最新 round 的状态、时间戳、驳回原因。\n" +
      "与 .kimi-code/hitl/ 下的哨兵文件构成双通道校验。未发起时返回提示调用 create_hitl。",
    inputSchema: {
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).optional().describe("审批类型（默认 PLAN）").default("PLAN"),
    },
  },
  async (args: { planName: string; type?: string }) => {
    try {
      const { planName, type } = args
      const state = await readHitlState(planName)
      if (!state) {
        return textResponse(
          `📋 HITL: 未发起\n\nplanName: ${planName}\ntype:     ${type || "PLAN"}\n\n操作: create_hitl({ planName: "${planName}", type: "${type || "PLAN"}" })`
        )
      }
      const icons: Record<string, string> = { DRAFT: "⏳", TONGYI: "✅", BOHUI: "❌" }
      const lines = [
        `📋 HITL: ${icons[state.status] || "❓"} ${state.status}`,
        "",
        `planName:   ${state.planName}`,
        `type:       ${state.type}`,
        `round:      ${state.round}`,
        `createdAt:  ${state.createdAt}`,
      ]
      if (state.approvedAt) lines.push(`approvedAt: ${state.approvedAt}`)
      if (state.rejectedAt) lines.push(`rejectedAt: ${state.rejectedAt}`)
      if (state.rejectReason) lines.push(`reason:     ${state.rejectReason}`)
      if (state.status === "BOHUI") {
        lines.push("", `💡 驳回后可 create_hitl 新建 round ${state.round + 1}。`)
      }
      if (state.status === "DRAFT") {
        lines.push("", `操作: update_hitl({ planName: "${planName}", type: "${state.type}", status: "TONGYI"|"BOHUI", _fallback: true })`)
      }
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`status_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
)

// ══════════════════════════════════════════════════════════════
// 0.3.40 对齐工具组 — 文件化实现（无 DB）
// add-coder 0.3.40 的 plan / review / contract / lifecycle / hook-event
// 工具依赖 Prisma；flash 以 .kimi-code 下的 JSON 索引 + 文档扫描提供等价语义。
// ══════════════════════════════════════════════════════════════

const ADD_MAGIC = ".kimi-code"
const ADD_PLANS_DIR = join(PROJECT_ROOT, ADD_MAGIC, "plans")
const ADD_SPECS_DIR = join(PROJECT_ROOT, ADD_MAGIC, "specs")
const ADD_REVIEWS_DIR = join(PROJECT_ROOT, ADD_MAGIC, "reviews")
const ADD_HITL_DIR = join(PROJECT_ROOT, ADD_MAGIC, "hitl")
const ADD_STATE_DIR = join(ADD_PLANS_DIR, ".state")
const LIFECYCLE_FILE = join(ADD_STATE_DIR, "lifecycle.json")
const ROUNDS_FILE = join(ADD_STATE_DIR, "rounds.json")
const REVIEW_INDEX_FILE = join(ADD_STATE_DIR, "reviews.json")
const CONTRACT_INDEX_FILE = join(ADD_STATE_DIR, "contracts.json")
const LIFECYCLE_EVENTS_FILE = join(ADD_STATE_DIR, "lifecycle-events.jsonl")

interface PlanEntry {
  name: string
  path: string
  rel: string
  version: number
  mtime: number
}

interface PlanProgress {
  doneTasks: number
  totalTasks: number
  checklistDone: number
  checklistTotal: number
  specDir: string
  handoff: string | null
  addRoute: string | null
}

interface LifecycleRecord {
  lifecycle: string
  revision: number
  updatedAt: string
  reason?: string
}

function relPath(abs: string): string {
  return relative(PROJECT_ROOT, abs).split("\\").join("/")
}

async function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T
  } catch {
    return fallback
  }
}

async function writeJsonSafe(file: string, value: unknown): Promise<void> {
  const { mkdir } = await import("fs/promises")
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf-8")
}

async function appendJsonl(file: string, value: unknown): Promise<void> {
  const { mkdir, appendFile } = await import("fs/promises")
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, JSON.stringify(value) + "\n", "utf-8")
}

async function listPlanEntries(): Promise<PlanEntry[]> {
  if (!existsSync(ADD_PLANS_DIR)) return []
  const files = await findFilesRecursive(ADD_PLANS_DIR, /-plan-v\d+\.md$/, 6)
  const out: PlanEntry[] = []
  for (const file of files) {
    const name = basename(file, ".md")
    const version = Number(/-plan-v(\d+)$/.exec(name)?.[1] ?? 0)
    const st = await stat(file).catch(() => null)
    out.push({ name, path: file, rel: relPath(file), version, mtime: st?.mtimeMs ?? 0 })
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

function resolvePlanEntry(entries: PlanEntry[], keyword?: string): PlanEntry | null {
  if (!entries.length) return null
  if (!keyword) return [...entries].sort((a, b) => b.version - a.version || b.mtime - a.mtime)[0]
  const k = keyword.toLowerCase()
  const matched = entries.filter((e) => e.name.toLowerCase().includes(k))
  if (!matched.length) return null
  return matched.sort((a, b) => b.version - a.version || b.mtime - a.mtime)[0]
}

async function resolveSpecDir(plan: PlanEntry): Promise<string> {
  const content = (await readFileSafe(plan.path)) ?? ""
  const explicit = content.match(/Spec:\s*`?([^`\n]+?)`?\s*$/m)?.[1]?.trim()
  const ref = explicit ?? content.match(/specs\/([^/`\s]+)/)?.[1]?.trim()
  if (ref) {
    // 引用可能指向目录或具体文件（spec.md / tasks.md / checklist.md）
    const cleaned = ref.replace(/^.*?specs\//, "").replace(/\/+$/, "")
    const dirPart = /\.md$/i.test(cleaned) ? dirname(cleaned) : cleaned
    if (dirPart) {
      const p = join(ADD_SPECS_DIR, dirPart)
      if (existsSync(p)) return p
    }
  }
  const base = plan.name.replace(/-plan-v\d+$/, "")
  return join(ADD_SPECS_DIR, base)
}

async function collectPlanProgress(plan: PlanEntry): Promise<PlanProgress> {
  const specDir = await resolveSpecDir(plan)
  const tasks = (await readFileSafe(join(specDir, "tasks.md"))) ?? ""
  const checklist = (await readFileSafe(join(specDir, "checklist.md"))) ?? ""
  const doneTasks = (tasks.match(/^- \[x\] /gmi) ?? []).length
  const totalTasks = doneTasks + (tasks.match(/^- \[ \] /gmi) ?? []).length
  const checklistDone = (checklist.match(/^- \[x\] /gmi) ?? []).length
  const checklistTotal = checklistDone + (checklist.match(/^- \[ \] /gmi) ?? []).length

  const planDir = dirname(plan.path)
  let handoff: string | null = null
  let addRoute: string | null = null
  try {
    for (const f of await readdir(planDir)) {
      if (!handoff && /handoff.*\.md$/.test(f)) handoff = join(planDir, f)
      if (!addRoute && /add-route.*\.md$/.test(f)) addRoute = join(planDir, f)
    }
  } catch {
    // 同目录不可读时保持 null
  }
  return { doneTasks, totalTasks, checklistDone, checklistTotal, specDir, handoff, addRoute }
}

function isReviewFile(name: string): boolean {
  return name.endsWith(".md") && /review/i.test(name) && !name.endsWith(".hitl.md")
}

function derivePlanPrefix(fileName: string): string {
  return basename(fileName, ".md")
    .replace(/-plan-v\d+-review$/, "")
    .replace(/-review-(implementation|runtime)$/, "")
    .replace(/-review-v\d+$/, "")
    .replace(/-review$/, "")
}

function detectReviewType(fileName: string): "PLAN_REVIEW" | "IMPLEMENTATION" | "RUNTIME" {
  const l = fileName.toLowerCase()
  if (l.includes("implementation")) return "IMPLEMENTATION"
  if (l.includes("runtime")) return "RUNTIME"
  return "PLAN_REVIEW"
}

function countIssueType(content: string): { p0: number; p1: number; backflow: number } {
  let p0 = 0
  let p1 = 0
  let backflow = 0
  for (const line of content.split("\n")) {
    if (/^\|\s*\d+\s*\|\s*P0\s*\|/i.test(line)) p0++
    if (/^\|\s*\d+\s*\|\s*P1\s*\|/i.test(line)) p1++
    if (/回流/i.test(line)) backflow++
  }
  return { p0, p1, backflow }
}

async function hasApprovedHitl(planName: string): Promise<boolean> {
  const base = planName
    .replace(/\.hitl$/, "")
    .replace(/-(plan|add-route|review)-v\d+$/, "")
    .replace(/-review-(implementation|runtime)$/, "")
  return [planName, base].some((n) => existsSync(join(ADD_HITL_DIR, `.tongyi-${n}`)))
}

function versionOf(file: string): number {
  return Number(/-v(\d+)\.md$/.exec(basename(file))?.[1] ?? 0)
}

/**
 * 版本配对（0.3.39 口径）：同目录同基名优先，版本最高者胜；
 * 不做「去版本后缀取首个匹配」，避免多版本共存时恒命中 v1。
 */
async function resolveSiblingForKeyword(
  keyword: string,
  kind: "add-route" | "handoff",
): Promise<string | null> {
  const pattern = kind === "add-route" ? /add-route.*\.md$/ : /handoff.*\.md$/i
  const plan = resolvePlanEntry(await listPlanEntries(), keyword)
  if (plan) {
    const base = plan.name.replace(/-plan-v\d+$/, "")
    const planVersion = Number(/-plan-v(\d+)$/.exec(plan.name)?.[1] ?? 0)
    const planDir = dirname(plan.path)
    const siblings = planDir !== ADD_PLANS_DIR
      ? (await findFilesRecursive(planDir, pattern, 1))
      : []
    const exact = planVersion > 0
      ? siblings.find((f) => basename(f) === `${base}-${kind}-v${planVersion}.md`)
      : undefined
    if (exact) return exact
    const sameBase = siblings.filter((f) => basename(f).startsWith(`${base}-${kind}-`))
    if (sameBase.length) return sameBase.sort((a, b) => versionOf(b) - versionOf(a))[0]
  }
  if (!existsSync(ADD_PLANS_DIR)) return null
  const all = await findFilesRecursive(ADD_PLANS_DIR, pattern, 6)
  const matched = all.filter((f) => basename(f).toLowerCase().includes(keyword.toLowerCase()))
  return matched.sort((a, b) => versionOf(b) - versionOf(a))[0] ?? null
}

// ── query_audit_logs（0.3.40 命名；与 query_audit_records 等价）──

server.registerTool(
  "query_audit_logs",
  {
    description: "查询开发操作审计记录（0.3.40 对齐命名）。无 DB 实现：从 .kimi-code/plans、specs、reviews 文档中提取记录，支持 planKeyword / 时间窗口过滤。",
    inputSchema: {
      planKeyword: z.string().optional().describe("按 Plan 关键词过滤（匹配文档路径）"),
      keyword: z.string().optional().describe("关键词搜索，在文档内容中模糊匹配"),
      targetType: z.string().optional().describe("按目标类型过滤（内容匹配，如 COMPONENT / API_ROUTE / SCHEMA）"),
      action: z.string().optional().describe("按动作过滤（内容匹配，如 RUNTIME_ERROR / CREATE / MODIFY）"),
      targetId: z.string().optional().describe("按目标标识过滤（内容匹配）"),
      sinceMinutes: z.number().optional().describe("时间窗口（分钟），基于文件修改时间过滤"),
      limit: z.number().optional().default(10).describe("返回最大条数，默认 10，最大 50"),
    },
  },
  async (args: { planKeyword?: string; keyword?: string; targetType?: string; action?: string; targetId?: string; sinceMinutes?: number; limit?: number }) => {
    try {
      const { planKeyword, keyword, targetType, action, targetId, sinceMinutes, limit = 10 } = args
      const contentFilters = [keyword, targetType, action, targetId].filter((v): v is string => Boolean(v))
      const docs: Array<{ path: string; type: string; mtime: Date }> = []
      for (const [dir, type] of [[ADD_PLANS_DIR, "plan"], [ADD_SPECS_DIR, "spec"], [ADD_REVIEWS_DIR, "review"]] as const) {
        if (!existsSync(dir)) continue
        for (const file of await findFilesRecursive(dir, /\.md$/, 5)) {
          const st = await stat(file).catch(() => null)
          if (st) docs.push({ path: relPath(file), type, mtime: st.mtime })
        }
      }
      docs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      let filtered = docs
      if (planKeyword) filtered = filtered.filter((d) => d.path.toLowerCase().includes(planKeyword.toLowerCase()))
      if (sinceMinutes !== undefined) {
        const since = new Date(Date.now() - sinceMinutes * 60 * 1000)
        filtered = filtered.filter((d) => d.mtime >= since)
      }
      if (contentFilters.length) {
        const matched: typeof filtered = []
        for (const doc of filtered) {
          const content = await readFileSafe(join(PROJECT_ROOT, doc.path))
          if (content && contentFilters.every((f) => content.toLowerCase().includes(f.toLowerCase()))) matched.push(doc)
        }
        filtered = matched
      }
      const limited = filtered.slice(0, Math.min(limit, 50))
      if (!limited.length) {
        return textResponse(`=== 审计记录查询 ===\n\n未找到匹配记录。\n文档总数: ${docs.length}（Plan + Spec + Review）`)
      }
      const lines = ["=== 审计记录 ==="]
      if (planKeyword) lines.push(`Plan 关键词: "${planKeyword}"`)
      if (contentFilters.length) lines.push(`内容过滤: ${contentFilters.join(" + ")}`)
      lines.push(`匹配 ${limited.length} 条，共 ${filtered.length} 条`, "")
      for (const doc of limited) {
        lines.push(`[${doc.type}] ${doc.path}`)
        lines.push(`修改时间: ${formatLocalTime(doc.mtime)}`)
        const content = await readFileSafe(join(PROJECT_ROOT, doc.path))
        if (content) {
          const title = content.split("\n")[0]?.replace(/^#+\s*/, "").trim()
          if (title) lines.push(`  标题: ${title}`)
          if (contentFilters.length) {
            const needle = contentFilters[0].toLowerCase()
            for (const ml of content.split("\n").filter((l) => l.toLowerCase().includes(needle)).slice(0, 3)) {
              lines.push(`  > ${ml.trim().substring(0, 100)}`)
            }
          }
        }
        lines.push("")
      }
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`查询审计记录失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── get_hook_events ─────────────────────────────────────────

server.registerTool(
  "get_hook_events",
  {
    description: "查询 Hook 拦截事件（.kimi-code/reports/hook-events.jsonl）。支持 planKeyword / hook / 时间窗口过滤，按 planKeyword 分组聚合。",
    inputSchema: {
      planKeyword: z.string().optional().describe("按 Plan 关键词过滤"),
      hook: z.string().optional().describe("按 hook 名称过滤: pre-tool-use / doc-format-guard / prompt-submit"),
      sinceMinutes: z.number().optional().describe("时间窗口起始（分钟前），如 1440=过去 24h"),
      limit: z.number().optional().default(50).describe("返回最大条数，默认 50，最大 200"),
    },
  },
  async (args: { planKeyword?: string; hook?: string; sinceMinutes?: number; limit?: number }) => {
    try {
      const { planKeyword, hook, sinceMinutes, limit = 50 } = args
      const file = join(PROJECT_ROOT, ADD_MAGIC, "reports", "hook-events.jsonl")
      if (!existsSync(file)) return textResponse("=== Hook 拦截事件 ===\n\nhook-events.jsonl 不存在——尚无 hook 事件记录。")
      const raw = (await readFileSafe(file)) ?? ""
      const since = sinceMinutes !== undefined ? Date.now() - sinceMinutes * 60 * 1000 : 0
      const events: Array<Record<string, unknown>> = []
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as Record<string, unknown>
          if (planKeyword && e.planKeyword !== planKeyword) continue
          if (hook && e.hook !== hook) continue
          const ts = typeof e.ts === "string" ? Date.parse(e.ts) : 0
          if (since && (!ts || ts < since)) continue
          events.push(e)
        } catch {
          // 跳过损坏行
        }
      }
      const limited = events.slice(-Math.min(limit, 200)).reverse()
      if (!limited.length) {
        const filters = [planKeyword && `planKeyword=${planKeyword}`, hook && `hook=${hook}`, sinceMinutes !== undefined && `过去${sinceMinutes}分钟`].filter(Boolean)
        return textResponse(`=== Hook 拦截事件 ===\n\n未找到匹配记录（条件: ${filters.length ? filters.join(", ") : "无过滤条件"}）。`)
      }
      const groups = new Map<string, number>()
      for (const e of limited) {
        const kw = typeof e.planKeyword === "string" ? e.planKeyword : "unknown"
        groups.set(kw, (groups.get(kw) ?? 0) + 1)
      }
      const lines = ["=== Hook 拦截事件 ===", `共 ${limited.length} 条`, "", "## 按 Plan 分组", ""]
      for (const [kw, count] of [...groups.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${kw}: ${count} 次`)
      lines.push("", "## 最近事件", "")
      for (const e of limited.slice(0, 20)) {
        lines.push(`  [${String(e.ts ?? "?").slice(11, 19)}] ${String(e.hook ?? "?")} ${String(e.decision ?? "?")} → ${String(e.reason ?? "(无)")} | plan: ${String(e.planKeyword ?? "?")}`)
      }
      const noPlan = groups.get("no-active-plan") ?? 0
      if (noPlan >= 10) lines.push("", `⚠️ 阈值告警: 无 Plan 违规 ${noPlan} 次（≥10），建议创建 Plan 或检查 hooks 误报`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`查询 hook 事件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── plan_track / plan_status / plan_sync ────────────────────

server.registerTool(
  "plan_track",
  {
    description: "Plan 追踪（无 DB）：扫描 plans/ 目录的 *-plan-v*.md，解析 tasks.md / checklist.md 进度，返回并写入 .kimi-code/plans/.state/plans.json 索引。",
    inputSchema: {
      planName: z.string().optional().describe("指定 Plan 名称扫描单个；不传则扫描全部"),
      scanAll: z.boolean().optional().describe("true 扫描全部 Plan"),
    },
  },
  async (args: { planName?: string; scanAll?: boolean }) => {
    try {
      const all = await listPlanEntries()
      const targets = args.planName ? all.filter((e) => e.name.includes(args.planName!)) : all
      if (!targets.length) return textResponse("=== Plan 追踪 ===\n\n未找到 *-plan-v*.md 文档。")
      const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
      const index = await readJsonSafe<Record<string, unknown>>(join(ADD_STATE_DIR, "plans.json"), {})
      const lines = ["=== Plan 追踪（无 DB） ===", ""]
      for (const plan of targets) {
        const p = await collectPlanProgress(plan)
        const lc = lifecycles[plan.name]?.lifecycle ?? "ACTIVE"
        index[plan.name] = {
          planName: plan.name,
          path: plan.rel,
          lifecycle: lc,
          doneTasks: p.doneTasks,
          totalTasks: p.totalTasks,
          checklistDone: p.checklistDone,
          checklistTotal: p.checklistTotal,
          updatedAt: new Date().toISOString(),
        }
        lines.push(`📄 ${plan.rel}`)
        lines.push(`  lifecycle: ${lc} | tasks: ${p.doneTasks}/${p.totalTasks} | checklist: ${p.checklistDone}/${p.checklistTotal}`)
        lines.push(`  spec: ${relPath(p.specDir)} | handoff: ${p.handoff ? relPath(p.handoff) : "❌"} | add-route: ${p.addRoute ? relPath(p.addRoute) : "❌"}`)
        lines.push("")
      }
      await writeJsonSafe(join(ADD_STATE_DIR, "plans.json"), index)
      lines.push(`索引已写入: ${relPath(join(ADD_STATE_DIR, "plans.json"))}`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`plan_track 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "plan_status",
  {
    description: "Plan 状态（无 DB）：返回指定/最新活跃 Plan 的生命周期、tasks/checklist 进度与关联产物路径。",
    inputSchema: {
      planName: z.string().optional().describe("Plan 名称或关键词；不传则返回最新活跃 Plan"),
    },
  },
  async (args: { planName?: string }) => {
    try {
      const all = await listPlanEntries()
      if (!all.length) return textResponse("=== Plan 状态 ===\n\n未找到 Plan 文档。")
      const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
      const candidates = args.planName ? all.filter((e) => e.name.includes(args.planName!)) : all
      const active = candidates
        .filter((e) => (lifecycles[e.name]?.lifecycle ?? "ACTIVE") !== "CLOSED")
        .sort((a, b) => b.mtime - a.mtime)[0] ?? null
      const plan = active ?? resolvePlanEntry(candidates, args.planName)
      if (!plan) return textResponse(`=== Plan 状态 ===\n\n未找到匹配 Plan（关键词: ${args.planName}）。`)
      const p = await collectPlanProgress(plan)
      const lc = lifecycles[plan.name]
      const lines = [
        "=== Plan 状态 ===",
        "",
        `Plan:      ${plan.name}`,
        `路径:      ${plan.rel}`,
        `生命周期:  ${lc?.lifecycle ?? "ACTIVE"}${lc?.updatedAt ? `（更新于 ${lc.updatedAt}）` : ""}`,
        `tasks:     ${p.doneTasks}/${p.totalTasks}`,
        `checklist: ${p.checklistDone}/${p.checklistTotal}`,
        `spec:      ${relPath(p.specDir)}`,
        `handoff:   ${p.handoff ? relPath(p.handoff) : "❌ 未找到"}`,
        `add-route: ${p.addRoute ? relPath(p.addRoute) : "❌ 未找到"}`,
      ]
      if (!active) lines.push("", "ℹ️ 当前没有 ACTIVE/REOPENED 的 Plan。")
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`plan_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "plan_sync",
  {
    description: "Plan 同步校验（无 DB）：逐 Plan 核对 Plan / tasks / checklist / handoff / add-route / spec 的存在性与完成度，报告缺口。",
    inputSchema: {
      planName: z.string().optional().describe("指定 Plan 名称或关键词；不传则校验全部"),
    },
  },
  async (args: { planName?: string }) => {
    try {
      const all = await listPlanEntries()
      const targets = args.planName ? all.filter((e) => e.name.includes(args.planName!)) : all
      if (!targets.length) return textResponse("=== Plan 同步校验 ===\n\n未找到 Plan 文档。")
      const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
      const lines = ["=== Plan 同步校验（无 DB） ===", ""]
      let warnings = 0
      for (const plan of targets) {
        const p = await collectPlanProgress(plan)
        const issues: string[] = []
        if (!existsSync(join(p.specDir, "spec.md"))) issues.push("spec.md 缺失")
        if (!existsSync(join(p.specDir, "tasks.md"))) issues.push("tasks.md 缺失")
        if (!existsSync(join(p.specDir, "checklist.md"))) issues.push("checklist.md 缺失")
        if (!p.handoff) issues.push("handoff 缺失")
        if (!p.addRoute) issues.push("add-route 缺失")
        if (p.totalTasks > 0 && p.doneTasks < p.totalTasks) issues.push(`tasks 未完成 ${p.doneTasks}/${p.totalTasks}`)
        if (p.checklistTotal > 0 && p.checklistDone < p.checklistTotal) issues.push(`checklist 未完成 ${p.checklistDone}/${p.checklistTotal}`)
        const lc = lifecycles[plan.name]?.lifecycle ?? "ACTIVE"
        lines.push(`${issues.length ? "⚠️" : "✅"} ${plan.name}（${lc}）`)
        if (issues.length) {
          warnings += issues.length
          for (const issue of issues) lines.push(`   - ${issue}`)
        } else {
          lines.push("   全部产物齐全且已闭环")
        }
        lines.push("")
      }
      lines.push(`--- 总结 ---`)
      lines.push(warnings ? `发现 ${warnings} 个缺口，建议先补齐再收敛。` : "全部 Plan 产物齐全。")
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`plan_sync 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── plan_round_status / plan_round_close ────────────────────

server.registerTool(
  "plan_round_status",
  {
    description: "Plan 轮次状态（无 DB）：读取 .kimi-code/plans/.state/rounds.json，返回指定 Plan 的施工轮次与最近关闭信息。",
    inputSchema: {
      planName: z.string().describe("Plan 名称或关键词"),
    },
  },
  async (args: { planName: string }) => {
    try {
      const plan = resolvePlanEntry(await listPlanEntries(), args.planName)
      if (!plan) return errorResponse(`未找到 Plan: ${args.planName}`)
      const rounds = await readJsonSafe<Record<string, { round: number; closedAt?: string; summary?: string }>>(ROUNDS_FILE, {})
      const r = rounds[plan.name]
      if (!r) return textResponse(`=== Plan 轮次 ===\n\nPlan: ${plan.name}\n轮次: 0（尚未 plan_round_close）`)
      return textResponse(
        [
          "=== Plan 轮次 ===",
          "",
          `Plan:    ${plan.name}`,
          `轮次:    ${r.round}`,
          `关闭于:  ${r.closedAt ?? "—"}`,
          `摘要:    ${r.summary ?? "—"}`,
        ].join("\n")
      )
    } catch (error) {
      return errorResponse(`plan_round_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "plan_round_close",
  {
    description: "Plan 轮次关闭（无 DB）：校验 tasks/checklist 已闭环后递增施工轮次，写入 rounds.json。force=true 可越过未完成项（需 summary）。",
    inputSchema: {
      planName: z.string().describe("Plan 名称或关键词"),
      summary: z.string().optional().describe("本轮摘要（写入轮次记录）"),
      force: z.boolean().optional().default(false).describe("强制关闭（越过未完成项）"),
    },
  },
  async (args: { planName: string; summary?: string; force?: boolean }) => {
    try {
      const plan = resolvePlanEntry(await listPlanEntries(), args.planName)
      if (!plan) return errorResponse(`未找到 Plan: ${args.planName}`)
      const p = await collectPlanProgress(plan)
      const blockers: string[] = []
      if (p.totalTasks > 0 && p.doneTasks < p.totalTasks) blockers.push(`tasks 未完成 ${p.doneTasks}/${p.totalTasks}`)
      if (p.checklistTotal > 0 && p.checklistDone < p.checklistTotal) blockers.push(`checklist 未完成 ${p.checklistDone}/${p.checklistTotal}`)
      if (blockers.length && !args.force) {
        return errorResponse(`轮次关闭被拒绝（${plan.name}）:\n- ${blockers.join("\n- ")}\n（force=true 可越过）`)
      }
      if (blockers.length && !args.summary) {
        return errorResponse(`force 关闭必须提供 summary，说明越过原因。\n阻塞项:\n- ${blockers.join("\n- ")}`)
      }
      const rounds = await readJsonSafe<Record<string, { round: number; closedAt?: string; summary?: string }>>(ROUNDS_FILE, {})
      const next = (rounds[plan.name]?.round ?? 0) + 1
      rounds[plan.name] = { round: next, closedAt: new Date().toISOString(), summary: args.summary }
      await writeJsonSafe(ROUNDS_FILE, rounds)
      await appendJsonl(LIFECYCLE_EVENTS_FILE, {
        event: "ROUND_CLOSED",
        planName: plan.name,
        round: next,
        forced: Boolean(args.force),
        blockers,
        summary: args.summary ?? "",
        at: new Date().toISOString(),
      })
      return textResponse(
        `✅ 轮次已关闭\n\nPlan: ${plan.name}\n轮次: ${next}\n${blockers.length ? `强制越过: ${blockers.join("; ")}` : "tasks/checklist 已闭环"}`
      )
    } catch (error) {
      return errorResponse(`plan_round_close 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── plan_update（生命周期唯一入口，文件化）──────────────────

server.registerTool(
  "plan_update",
  {
    description: "Plan 生命周期关闭/重开（无 DB 唯一入口）。target: ACTIVE / CLOSED / REOPENED。关闭前校验 tasks 闭环 + HITL TONGYI 哨兵；REOPENED 必须给 policyRef。记录写入 .kimi-code/plans/.state/lifecycle.json 与事件流。",
    inputSchema: {
      planName: z.string().describe("Plan 名称或关键词"),
      target: z.enum(["ACTIVE", "CLOSED", "REOPENED"]).describe("目标生命周期状态"),
      reason: z.string().optional().describe("变更原因（force 时必填）"),
      policyRef: z.string().optional().describe("REOPENED 必填：触发重开的策略引用（PUL 追溯）"),
      force: z.boolean().optional().default(false).describe("越过前置校验（必须同时给 reason）"),
    },
  },
  async (args: { planName: string; target: string; reason?: string; policyRef?: string; force?: boolean }) => {
    try {
      const plan = resolvePlanEntry(await listPlanEntries(), args.planName)
      if (!plan) return errorResponse(`未找到 Plan: ${args.planName}`)
      const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
      const current = lifecycles[plan.name]?.lifecycle ?? "ACTIVE"
      if (current === args.target) {
        return textResponse(`ℹ️ ${plan.name} 已是 ${args.target}（幂等，无变更）`)
      }
      const p = await collectPlanProgress(plan)
      const blockers: string[] = []
      if (args.target === "CLOSED") {
        if (p.totalTasks > 0 && p.doneTasks < p.totalTasks) blockers.push(`tasks 未完成 ${p.doneTasks}/${p.totalTasks}`)
        if (!(await hasApprovedHitl(plan.name))) blockers.push("缺少 PLAN 类型 HITL TONGYI 哨兵（审批链未留痕）")
      }
      if (args.target === "REOPENED" && !args.policyRef) blockers.push("REOPENED 必须给 policyRef（PUL 追溯）")
      if (blockers.length && !args.force) {
        return errorResponse(`前置校验未通过，拒绝 ${plan.name} → ${args.target}:\n- ${blockers.join("\n- ")}\n（force=true 可越过，但必须给 reason）`)
      }
      if (blockers.length && !args.reason) {
        return errorResponse(`force 变更必须提供 reason。\n阻塞项:\n- ${blockers.join("\n- ")}`)
      }
      const revision = (lifecycles[plan.name]?.revision ?? 0) + 1
      lifecycles[plan.name] = {
        lifecycle: args.target,
        revision,
        updatedAt: new Date().toISOString(),
        reason: args.reason,
      }
      await writeJsonSafe(LIFECYCLE_FILE, lifecycles)
      await appendJsonl(LIFECYCLE_EVENTS_FILE, {
        event: "PLAN_LIFECYCLE",
        planName: plan.name,
        from: current,
        to: args.target,
        revision,
        forced: Boolean(args.force),
        blockers,
        reason: args.reason ?? "",
        policyRef: args.policyRef ?? "",
        at: new Date().toISOString(),
      })
      return textResponse(
        [
          "✅ Plan 生命周期已更新",
          "",
          `Plan:     ${plan.name}`,
          `状态:     ${current} → ${args.target}`,
          `revision: ${revision}`,
          args.policyRef ? `policyRef: ${args.policyRef}` : "",
          blockers.length ? `强制越过: ${blockers.join("; ")}` : "",
        ].filter(Boolean).join("\n")
      )
    } catch (error) {
      return errorResponse(`plan_update 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── review_track / review_status / review_sync ──────────────

server.registerTool(
  "review_track",
  {
    description: "Review 追踪（无 DB）：扫描 reviews/ 的 review 文档，解析 P0/P1 缺陷数与回流标记，写入 .kimi-code/plans/.state/reviews.json 索引。",
    inputSchema: {
      planName: z.string().optional().describe("指定 Plan 名称/前缀扫描关联 review"),
      scanAll: z.boolean().optional().describe("true 扫描全部 review"),
    },
  },
  async (args: { planName?: string; scanAll?: boolean }) => {
    try {
      if (!existsSync(ADD_REVIEWS_DIR)) return errorResponse(`reviews 目录不存在: ${relPath(ADD_REVIEWS_DIR)}`)
      const files = (await findFilesRecursive(ADD_REVIEWS_DIR, /\.md$/, 5)).filter((f) => isReviewFile(basename(f)))
      const index = await readJsonSafe<Record<string, unknown>>(REVIEW_INDEX_FILE, {})
      const lines = ["=== Review 追踪（无 DB） ===", ""]
      let count = 0
      for (const file of files) {
        const name = basename(file, ".md")
        const prefix = derivePlanPrefix(name)
        if (args.planName && !prefix.includes(args.planName)) continue
        const content = (await readFileSafe(file)) ?? ""
        const stats = countIssueType(content)
        const type = detectReviewType(name)
        index[`${prefix}:${type}`] = { planPrefix: prefix, type, path: relPath(file), ...stats, updatedAt: new Date().toISOString() }
        lines.push(`📄 ${relPath(file)}`)
        lines.push(`   type: ${type} | P0: ${stats.p0} | P1: ${stats.p1} | 回流标记: ${stats.backflow}`)
        lines.push("")
        count++
      }
      if (!count) return textResponse(`=== Review 追踪 ===\n\n未找到匹配 review 文档（条件: ${args.planName ?? "全部"}）。`)
      await writeJsonSafe(REVIEW_INDEX_FILE, index)
      lines.push(`共 ${count} 份 review；索引已写入: ${relPath(REVIEW_INDEX_FILE)}`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`review_track 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "review_status",
  {
    description: "Review 状态（无 DB）：读取 reviews.json 索引；索引缺失时即时扫描。返回各 Plan 的 P0/P1/回流统计。",
    inputSchema: {
      planName: z.string().optional().describe("指定 Plan 名称/前缀"),
    },
  },
  async (args: { planName?: string }) => {
    try {
      let index = await readJsonSafe<Record<string, { planPrefix: string; type: string; path: string; p0: number; p1: number; backflow: number }>>(REVIEW_INDEX_FILE, {})
      if (!Object.keys(index).length) {
        if (!existsSync(ADD_REVIEWS_DIR)) return textResponse("=== Review 状态 ===\n\nreviews 目录不存在，无 review 文档。")
        for (const file of (await findFilesRecursive(ADD_REVIEWS_DIR, /\.md$/, 5)).filter((f) => isReviewFile(basename(f)))) {
          const name = basename(file, ".md")
          const content = (await readFileSafe(file)) ?? ""
          index[`${derivePlanPrefix(name)}:${detectReviewType(name)}`] = { planPrefix: derivePlanPrefix(name), type: detectReviewType(name), path: relPath(file), ...countIssueType(content) }
        }
      }
      const rows = Object.values(index).filter((r) => !args.planName || r.planPrefix.includes(args.planName))
      if (!rows.length) return textResponse(`=== Review 状态 ===\n\n无匹配 review（关键词: ${args.planName ?? "全部"}）。`)
      const lines = ["=== Review 状态 ===", "", "| Plan 前缀 | 类型 | P0 | P1 | 回流 | 路径 |", "|---|---|:--:|:--:|:--:|---|"]
      for (const r of rows) lines.push(`| ${r.planPrefix} | ${r.type} | ${r.p0} | ${r.p1} | ${r.backflow} | ${r.path} |`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`review_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "review_sync",
  {
    description: "Review 同步校验（无 DB）：比对 review 文档前缀与 Plan 文档，报告无主 review 与缺 review 的已关闭 Plan。",
    inputSchema: {},
  },
  async () => {
    try {
      const plans = await listPlanEntries()
      const lifecycles = await readJsonSafe<Record<string, LifecycleRecord>>(LIFECYCLE_FILE, {})
      const reviews = existsSync(ADD_REVIEWS_DIR)
        ? (await findFilesRecursive(ADD_REVIEWS_DIR, /\.md$/, 5)).filter((f) => isReviewFile(basename(f)))
        : []
      const prefixes = new Set(reviews.map((f) => derivePlanPrefix(basename(f))))
      const planPrefixes = new Set(plans.map((p) => p.name.replace(/-plan-v\d+$/, "")))
      const orphanReviews = [...prefixes].filter((p) => ![...planPrefixes].some((pp) => p.includes(pp) || pp.includes(p)))
      const missingReviews = plans
        .filter((p) => (lifecycles[p.name]?.lifecycle ?? "ACTIVE") === "CLOSED")
        .map((p) => p.name.replace(/-plan-v\d+$/, ""))
        .filter((p) => !prefixes.has(p))
      const lines = ["=== Review 同步校验 ===", "", `Plan: ${plans.length} | Review: ${reviews.length}`, ""]
      lines.push(orphanReviews.length ? `⚠️ 无主 review: ${orphanReviews.join(", ")}` : "✅ 无无主 review")
      lines.push(missingReviews.length ? `⚠️ 已关闭但缺 review: ${missingReviews.join(", ")}` : "✅ 已关闭 Plan 均有 review")
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`review_sync 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── contract_track / contract_status ────────────────────────

function parseContractDoc(content: string): { participants: number; stages: number; fileBoundaries: number; hasDependencyGraph: boolean } {
  const rows = (re: RegExp): number => (content.match(re) ?? []).length
  return {
    participants: rows(/^\|\s*\*\*(.+?)\*\*\s*\|/gm),
    stages: rows(/^\|\s*[A-Za-z0-9-]+\s*\|\s*.+?\|\s*.+?\|\s*(并行|串行)\s*\|$/gm),
    fileBoundaries: rows(/^\|\s*.+?\s*\|\s*.+?\s*\|\s*.+?\s*\|$/gm),
    hasDependencyGraph: /依赖:/.test(content) && /```/.test(content),
  }
}

server.registerTool(
  "contract_track",
  {
    description: "并发协作契约追踪（无 DB）：扫描 plans/ 的 *-collab-contract-*.md，解析参与者/阶段/文件边界，写入 contracts.json 索引。",
    inputSchema: {
      contractName: z.string().optional().describe("指定契约名称扫描单个；不传则扫描全部"),
    },
  },
  async (args: { contractName?: string }) => {
    try {
      if (!existsSync(ADD_PLANS_DIR)) return errorResponse(`plans 目录不存在: ${relPath(ADD_PLANS_DIR)}`)
      const files = (await findFilesRecursive(ADD_PLANS_DIR, /\.md$/, 6)).filter((f) => {
        const n = basename(f)
        return n.endsWith(".md") && n.includes("-collab-contract-") && !n.includes("-plan-") && !n.includes("add-route") && !n.includes("handoff")
      })
      const targets = args.contractName ? files.filter((f) => basename(f).includes(args.contractName!)) : files
      if (!targets.length) return textResponse(`=== 并发协作契约追踪 ===\n\n未找到契约文档（条件: ${args.contractName ?? "全部"}）。`)
      const index = await readJsonSafe<Record<string, unknown>>(CONTRACT_INDEX_FILE, {})
      const lines = ["=== 并发协作契约追踪（无 DB） ===", ""]
      for (const file of targets) {
        const name = basename(file, ".md")
        const content = (await readFileSafe(file)) ?? ""
        const parsed = parseContractDoc(content)
        const masterPlan = content.match(/总控 Plan:\s*`?([^`\n]+)`?/)?.[1]?.trim().replace(/\.md$/, "") ?? ""
        index[name] = { contractName: name, path: relPath(file), masterPlan, ...parsed, updatedAt: new Date().toISOString() }
        lines.push(`📄 ${relPath(file)}`)
        lines.push(`   总控 Plan: ${masterPlan || "—"}`)
        lines.push(`   参与者: ${parsed.participants} | 阶段: ${parsed.stages} | 文件边界: ${parsed.fileBoundaries} | 依赖图: ${parsed.hasDependencyGraph ? "✅" : "❌"}`)
        lines.push("")
      }
      await writeJsonSafe(CONTRACT_INDEX_FILE, index)
      lines.push(`索引已写入: ${relPath(CONTRACT_INDEX_FILE)}`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`contract_track 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "contract_status",
  {
    description: "并发协作契约状态（无 DB）：读取 contracts.json 索引；索引缺失时即时扫描。",
    inputSchema: {
      contractName: z.string().optional().describe("指定契约名称"),
    },
  },
  async (args: { contractName?: string }) => {
    try {
      const index = await readJsonSafe<Record<string, { contractName: string; path: string; masterPlan: string; participants: number; stages: number; fileBoundaries: number; hasDependencyGraph: boolean }>>(CONTRACT_INDEX_FILE, {})
      const rows = Object.values(index).filter((r) => !args.contractName || r.contractName.includes(args.contractName))
      if (!rows.length) {
        return textResponse("=== 契约状态 ===\n\n索引为空。先调用 contract_track({}) 扫描。")
      }
      const lines = ["=== 契约状态 ===", "", "| 契约 | 总控 Plan | 参与者 | 阶段 | 边界 | 依赖图 |", "|---|---|:--:|:--:|:--:|:--:|"]
      for (const r of rows) lines.push(`| ${r.contractName} | ${r.masterPlan || "—"} | ${r.participants} | ${r.stages} | ${r.fileBoundaries} | ${r.hasDependencyGraph ? "✅" : "❌"} |`)
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`contract_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── render_hitl_approval（文件化降级渲染）───────────────────

server.registerTool(
  "render_hitl_approval",
  {
    description: "只读渲染 HITL 提案：从 .kimi-code/hitl/{planName}.json 读取状态，生成可离线打开的 {planName}.hitl.html（注入 window.__WIDGET_DATA__），并返回 markdown/HTML 双路径。",
    inputSchema: {
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).optional().default("PLAN").describe("审批类型"),
    },
  },
  async (args: { planName: string; type?: string }) => {
    try {
      const state = await readHitlState(args.planName)
      if (!state) return errorResponse(`未找到 HITL 记录: ${args.planName}。请先 create_hitl。`)
      if (!["DRAFT", "SUBMITTED"].includes(state.status)) {
        return errorResponse(`HITL round ${state.round} 已是终态 ${state.status}，不可再次审批`)
      }
      const dimensions = state.dimensions ?? []
      if (!dimensions.length) return errorResponse(`HITL 提案缺少可渲染维度: ${args.planName}`)
      const templatePath = join(PROJECT_ROOT, ADD_MAGIC, "templates", "hitl-approval-widget.html")
      let htmlPath = ""
      if (existsSync(templatePath)) {
        const payload = {
          planName: state.planName,
          type: state.type,
          round: state.round,
          status: state.status,
          dimensions,
        }
        const html = (await readFileSafe(templatePath)) ?? ""
        const injected = html.replace(
          "</body>",
          `<script>window.__WIDGET_DATA__ = ${JSON.stringify(payload).replace(/</g, "\\u003c")}; if (typeof applyData === "function") applyData(window.__WIDGET_DATA__);</script>\n</body>`
        )
        const out = join(ADD_HITL_DIR, `${args.planName}.hitl.html`)
        const { mkdir } = await import("fs/promises")
        await mkdir(ADD_HITL_DIR, { recursive: true })
        await writeFile(out, injected, "utf-8")
        htmlPath = relPath(out)
      }
      const markdownPath = existsSync(join(ADD_HITL_DIR, `${args.planName}.hitl.md`))
        ? relPath(join(ADD_HITL_DIR, `${args.planName}.hitl.md`))
        : ""
      const lines = [
        "=== HITL 审批渲染 ===",
        "",
        `planName:   ${state.planName}`,
        `type:       ${state.type}`,
        `round:      ${state.round}`,
        `status:     ${state.status}`,
        `markdown:   ${markdownPath || "—"}`,
        `html:       ${htmlPath || "—（widget 模板缺失）"}`,
        "",
        "维度:",
        ...dimensions.map((d, i) => `  ${i + 1}. ${d.name}: ${d.content || "—"}`),
        "",
        "最终裁决仍由 update_hitl 落库/落哨兵；render 本身不修改状态。",
      ]
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`render_hitl_approval 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── generate_audit_logger（无 DB：console + file 双通道）─────

server.registerTool(
  "generate_audit_logger",
  {
    description: "生成无 DB 审计日志器（console + file 双通道）到 .kimi-code/scripts/audit-logger.ts。ADD-1 审计基础设施优先：先有 logger，再在业务代码打点。",
    inputSchema: {
      featureName: z.string().optional().default("app").describe("功能/模块名，写入日志前缀"),
      outputPath: z.string().optional().describe("输出路径（相对项目根），默认 .kimi-code/scripts/audit-logger.ts"),
      force: z.boolean().optional().default(false).describe("覆盖已存在文件"),
    },
  },
  async (args: { featureName?: string; outputPath?: string; force?: boolean }) => {
    try {
      const feature = args.featureName || "app"
      const target = join(PROJECT_ROOT, args.outputPath || join(ADD_MAGIC, "scripts", "audit-logger.ts"))
      if (existsSync(target) && !args.force) {
        return errorResponse(`文件已存在: ${relPath(target)}（force=true 覆盖）`)
      }
      const content = `/**
 * ADD 审计日志器（无 DB 版，feature: ${feature}）
 * 双通道输出：console（Layer 1）+ file（Layer 2 JSONL）；业务回调可选
 * 生成源：.kimi-code/scripts/mcp-server.ts generate_audit_logger
 */
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

export type AuditPhase = string

export interface AuditEvent {
  phase: AuditPhase
  message: string
  extra?: Record<string, unknown>
}

const LOG_FILE = join(process.cwd(), "${ADD_MAGIC}", "reports", "audit-${feature}.jsonl")

export function agentAudit(phase: AuditPhase, message: string, extra?: Record<string, unknown>): void {
  const event: AuditEvent & { at: string } = { phase, message, extra, at: new Date().toISOString() }
  // Layer 1: console
  console.log(\`[AUDIT][\${phase}] \${message}\`, extra ?? "")
  // Layer 2: file
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, JSON.stringify(event) + "\\n", "utf-8")
  } catch {
    // 文件通道失败不阻断业务
  }
}
`
      const { mkdir } = await import("fs/promises")
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, "utf-8")
      return textResponse(
        [
          "✅ 审计日志器已生成",
          "",
          `路径: ${relPath(target)}`,
          `feature: ${feature}`,
          `日志: ${ADD_MAGIC}/reports/audit-${feature}.jsonl`,
          "",
          `使用: import { agentAudit } from "<相对项目根的路径>/${relPath(target).replace(/\.ts$/, "")}"; agentAudit("PHASE", "message", { ... })`,
        ].join("\n")
      )
    } catch (error) {
      return errorResponse(`generate_audit_logger 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ── Main ────────────────────────────────────────────────────

async function main() {
  await tryLoadEnv()

  console.error("╔══════════════════════════════════════════════════════╗")
  console.error("║  ADD Dev Tools — Kimi Code (no DB)                   ║")
  console.error("║  Version: 1.1.0                                     ║")
  console.error("╚══════════════════════════════════════════════════════╝")
  console.error(`[ADD-KIMI-MCP] PROJECT_ROOT: ${PROJECT_ROOT}`)
  console.error("[ADD-KIMI-MCP] 工具列表:")
  console.error("  1. get_project_context      — 获取项目全文上下文")
  console.error("  2. get_vue_component_info   — 获取 Vue 组件结构")
  console.error("  3. get_route_definition     — 获取路由定义")
  console.error("  4. get_api_definition       — 获取 API 接口定义")
  console.error("  5. find_related_docs        — 搜索 .kimi-code/ 相关文档")
  console.error("  6. check_phase_symmetry     — 检查组件生命周期对称性")
  console.error("  7. check_failure_path       — 检查失败路径处理")
  console.error("  8. query_audit_records      — 查询开发操作审计记录")
  console.error("  9. record_dev_operation     — 记录开发操作")
  console.error(" 10. check_implementation_alignment — 检查实现对齐（ADD-10）")
  console.error(" 11. scan_runtime_reviews     — 扫描运行时纠偏文档（ADD-11）")
  console.error(" 12. check_spec_drift         — 检测 Spec 漂移（ADD-12）")
  console.error(" 13. get_add_template         — 获取 ADD 工作流模板（ADD-8）")
  console.error(" 14. check_add_route_status   — 校验 add-route 文件存在性（ADD-15）")
  console.error(" 15. check_add_route_completeness — 扫描 add-route Step 完成度（ADD-15）")
  console.error(" 16. check_dps                — 上游文档质量量化（ADD-13）")
  console.error(" 17. check_rahs               — 轮次注意力健康度量（ADD-14）")
  console.error(" 18. get_spec_context         — 读取 spec 三元组上下文")
  console.error(" 20. check_add_compliance     — TypeScript 代码 ADD-1~6 合规检查")
  console.error(" 21. check_spec_sync          — 文档-代码交叉校验")
  console.error(" 22. check_handoff_status     — 校验 Handoff 交接文档存在性")
  console.error(" 23. check_plan_status        — 校验 Plan 文档存在性")
  console.error(" 24. check_specs_status       — 校验 Specs 三元组完整性")
  console.error(" 25. create_hitl              — HITL 审批：创建提案（文件化，无 DB）")
  console.error(" 26. update_hitl              — HITL 审批：更新状态（TONGYI/BOHUI + 哨兵）")
  console.error(" 27. status_hitl              — HITL 审批：查询状态")
  console.error(" 28. query_audit_logs         — 查询开发操作审计记录（0.3.40 命名）")
  console.error(" 29. get_hook_events          — 查询 Hook 拦截事件")
  console.error(" 30. plan_track               — Plan 追踪（文件化，无 DB）")
  console.error(" 31. plan_status              — Plan 状态")
  console.error(" 32. plan_sync                — Plan 同步校验")
  console.error(" 33. plan_round_status        — Plan 轮次状态")
  console.error(" 34. plan_round_close         — Plan 轮次关闭")
  console.error(" 35. plan_update              — Plan 生命周期关闭/重开")
  console.error(" 36. review_track             — Review 追踪")
  console.error(" 37. review_status            — Review 状态")
  console.error(" 38. review_sync              — Review 同步校验")
  console.error(" 39. contract_track           — 并发协作契约追踪")
  console.error(" 40. contract_status          — 并发协作契约状态")
  console.error(" 41. render_hitl_approval     — 渲染 HITL 提案（markdown + HTML）")
  console.error(" 42. generate_audit_logger    — 生成无 DB 审计日志器")

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ADD-KIMI-MCP] {{mcpServerName}} MCP server started on stdio")
}

main().catch((error) => {
  console.error("[ADD-KIMI-MCP] Fatal error:", error)
  process.exit(1)
})
