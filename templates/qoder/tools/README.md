# IDE AI 编程工具定义机制

## 现状分析

当前 VS Code + Copilot 的工具调用机制存在明显局限：

### 现有机制的限制
1. **Skill/Rule 机制**：通过 markdown 文件定义，只能提供指导性工作流，无法执行实际代码
2. **无 Code Tool Call**：AI 助手无法直接调用代码执行工具，只能生成代码建议
3. **静态定义**：工具定义是静态的，无法根据上下文动态调整

### 用户痛点
- AI 助手能分析问题，但无法直接执行验证、测试、部署等操作
- 需要手动复制粘贴 AI 生成的代码到终端执行
- 无法形成"分析→执行→验证"的闭环开发流程

## 超越 Skill/Rule 的工具定义方案

### 方案一：MCP (Model Context Protocol) 集成

**优势**：
- 标准化协议，支持多种工具类型
- 可以在 VS Code 中注册自定义工具
- 支持工具执行结果的结构化返回

**实现方式**：
```json
// .qoder/mcp.json
{
  "mcpServers": {
    "farm-qoder-dev-tools": {
      "command": "tsx",
      "args": [".qoder/scripts/mcp-server.ts"],
      "cwd": "/path/to/project",
      "env": { "NODE_ENV": "development" }
    }
  }
}
```

本项目已通过 MCP 实现了以下工具：
- `get_project_context` — 获取项目全文上下文
- `get_vue_component_info` — 获取 Vue 组件结构
- `get_route_definition` — 获取路由定义
- `get_api_definition` — 获取 API 接口定义
- `find_related_docs` — 搜索相关文档
- `check_phase_symmetry` — 检查生命周期对称性
- `check_failure_path` — 检查错误处理完备性
- `query_audit_records` — 查询审计记录
- `record_dev_operation` — 记录开发操作
- `check_add_route_completeness` — 检查 add-route 完成度
- `check_dps` — DPS 上游文档质量闸门
- `check_rahs` — RAHS 下游执行健康度闸门
- `get_spec_context` — 读取 spec 三元组（spec.md + tasks.md + checklist.md）
- `check_add_compliance` — TypeScript 代码 ADD-1~6 合规检查
- `check_spec_sync` — 文档-代码交叉校验

### 方案二：VS Code 扩展 API 自定义工具

**优势**：
- 深度集成 VS Code
- 可以访问编辑器状态、文件系统、终端等
- 支持复杂的 UI 交互

**实现方式**：
```typescript
// src/extension.ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  // 注册 ADD 工具提供者
  const addToolProvider = new AddToolProvider()
  context.subscriptions.push(
    vscode.commands.registerCommand('add.runAuditCheck', async () => {
      const result = await addToolProvider.runAuditCheck()
      // 在输出面板显示结果
      addToolProvider.showResults(result)
    })
  )

  // 注册工具到 Copilot
  vscode.commands.registerCommand('add.registerTools', () => {
    // 通过 Copilot API 注册工具
    registerCopilotTools([
      {
        name: 'audit_code_check',
        description: '检查当前文件的 ADD 审计合规性',
        parameters: {
          type: 'object',
          properties: {
            checkType: { type: 'string', enum: ['all', 'phases', 'logs'] }
          }
        },
        handler: async (params) => {
          const activeEditor = vscode.window.activeTextEditor
          if (!activeEditor) return { error: 'No active editor' }

          const result = await checkFileAuditCompliance(
            activeEditor.document.fileName,
            params.checkType
          )

          return {
            success: true,
            result: result,
            suggestions: generateFixSuggestions(result)
          }
        }
      }
    ])
  })
}

class AddToolProvider {
  async runAuditCheck(): Promise<AuditCheckResult> {
    // 执行审计检查逻辑
    const workspace = vscode.workspace.workspaceFolders?.[0]
    if (!workspace) throw new Error('No workspace found')

    // 扫描所有 TypeScript 文件
    const files = await vscode.workspace.findFiles('src/**/*.ts', '**/node_modules/**')
    
    const results = []
    for (const file of files) {
      const content = await vscode.workspace.fs.readFile(file)
      const auditResult = await checkFileAuditCompliance(file.fsPath, content.toString())
      results.push({ file: file.fsPath, ...auditResult })
    }

    return { files: results }
  }

  showResults(result: AuditCheckResult) {
    // 在输出面板显示结果
    const output = vscode.window.createOutputChannel('ADD Audit Check')
    output.clear()
    output.appendLine('=== ADD 审计合规性检查结果 ===\n')
    
    for (const fileResult of result.files) {
      output.appendLine(`📄 ${fileResult.file}`)
      output.appendLine(`  ✅ 阶段对称: ${fileResult.phaseSymmetry ? '通过' : '失败'}`)
      output.appendLine(`  ✅ 最小单元: ${fileResult.minUnit ? '通过' : '失败'}`)
      output.appendLine(`  ✅ 失败路径: ${fileResult.failurePath ? '通过' : '失败'}`)
      output.appendLine('')
    }
    
    output.show()
  }
}
```

### 方案三：自定义工具注册协议

**优势**：
- 轻量级实现
- 不依赖外部协议
- 易于扩展和维护

**实现方式**：
```typescript
// .qoder/tools/index.ts - 工具注册中心
export interface ToolDefinition {
  name: string
  description: string
  category: 'audit' | 'codegen' | 'test' | 'deploy'
  parameters: ToolParameter[]
  handler: ToolHandler
  requiresConfirmation?: boolean
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  description: string
  required: boolean
  enum?: string[]
}

export type ToolHandler = (params: Record<string, any>) => Promise<ToolResult>

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  logs?: string[]
}

// 注册 ADD 工具
export const ADD_TOOLS: ToolDefinition[] = [
  {
    name: 'audit_compliance_check',
    description: '检查代码是否符合 ADD 范式审计要求',
    category: 'audit',
    parameters: [
      {
        name: 'target',
        type: 'enum',
        description: '检查目标',
        required: true,
        enum: ['current_file', 'workspace', 'specific_file']
      },
      {
        name: 'filePath',
        type: 'string',
        description: '指定文件路径（当 target 为 specific_file 时）',
        required: false
      }
    ],
    handler: async (params) => {
      try {
        const result = await runAuditCheck(params)
        return { success: true, data: result }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  },
  {
    name: 'generate_add_code',
    description: '生成符合 ADD 范式的代码模板',
    category: 'codegen',
    parameters: [
      {
        name: 'featureName',
        type: 'string',
        description: '功能名称',
        required: true
      },
      {
        name: 'phases',
        type: 'string',
        description: '审计阶段（逗号分隔）',
        required: true
      }
    ],
    handler: async (params) => {
      const code = generateAddCodeTemplate(params.featureName, params.phases.split(','))
      return { success: true, data: { code } }
    }
  }
]

// 工具执行引擎
export class ToolExecutor {
  private tools = new Map<string, ToolDefinition>()

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool)
  }

  async executeTool(name: string, params: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` }
    }

    // 参数验证
    const validation = validateParameters(tool.parameters, params)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // 确认执行（如果需要）
    if (tool.requiresConfirmation) {
      const confirmed = await requestUserConfirmation(tool.name, params)
      if (!confirmed) {
        return { success: false, error: 'User cancelled execution' }
      }
    }

    // 执行工具
    try {
      const result = await tool.handler(params)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

// Copilot 集成
export function integrateWithCopilot(executor: ToolExecutor) {
  // 通过 VS Code API 或 MCP 注册工具到 Copilot
  // AI 助手可以调用这些工具
}
```

## 实施建议

### 阶段一：MCP 集成（已完成）
1. 实现基本的 MCP 服务器
2. 注册核心 ADD 工具（审计检查、代码验证、上下文查询）
3. 在 Trae IDE 中配置 MCP 服务器

### 阶段二：扩展工具覆盖
1. 增加前端专属工具（组件生成、路由生成、API 生成）
2. 增加类型检查集成
3. 增加 Lint 检查集成

### 阶段三：生态建设
1. 定义工具开发规范
2. 建立工具共享机制（跨项目 farm-agent / node_ruoyi / agrisynapse 的工具复用）
3. 完善工具生命周期管理

## 与 Skill/Rule 的关系

- **Skill/Rule**：提供指导性工作流和约束规则
- **Tools**：提供可执行的代码操作能力
- **互补关系**：Skill 定义"应该怎么做"，Tools 提供"怎么执行"

通过 Tools 机制，可以让 AI 助手从"只能建议代码"升级为"可以直接执行开发操作"，形成真正的 AI 编程助手生态。
