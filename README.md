# add-coder-flash

> 仓库：https://github.com/Milkycoffees/add-coder-flash

**超级轻量**的 ADD 编程范式脚手架，面向 **Kimi Code**：核心工作流零依赖（hooks 为纯 node `.mjs`，无需数据库），安装即铺设，一条命令把 hooks / templates / rules / skills 等资产部署到目标项目的 `.kimi-code/`，开箱即用。

轻量设计使其**尤其适合前端项目**，同样**适用于全栈项目**——内置单文件 MCP server 与无 DB 桥接方案，无数据库场景开箱即用；有数据库的项目也可在此基础上自行扩展。

## 安装

```bash
# 作为 devDependency 安装
npm install -D add-coder-flash
# 或 pnpm
pnpm add -D add-coder-flash
```

**安装即铺设**：`npm install` 后自动把资产铺到项目 `.kimi-code/`（postinstall 钩子），无需手动执行命令。

> pnpm v10+ 默认不执行依赖包的 postinstall 脚本，需在 `pnpm-workspace.yaml` 放行：
> ```yaml
> allowBuilds:
>   'add-coder-flash': true
> ```

手动执行（仅覆盖/指定目录等场景需要）：

```bash
npx add-coder-flash init            # 补缺（已存在跳过）
npx add-coder-flash init --force    # 覆盖已有文件
npx add-coder-flash init --dir <path>  # 指定目标目录
npx add-coder-flash init --mcp-name <name>  # 指定 MCP server 名
```

铺设后：

1. 资产铺到 `<目标项目>/.kimi-code/`：`hooks` / `templates` / `rules` / `skills` / `agents` / `vocabulary` / `tools` / `scripts` / `settings.json` / `hooks.toml` / `sync-policy.json` / `mcp.json`
2. 文本资产中的占位符自动渲染：`{{projectRoot}}`、`{{projectName}}`、`{{mcpServerName}}`、`{{magicDir}}`
3. **生成 `<目标项目>/.kimi-code/mcp.json`**（Kimi Code 项目级 MCP 配置源，写入即被读取；首次在新项目打开会话时需在信任提示中信任该目录）
4. 目标项目已有的业务目录（`plans` / `specs` / `reviews` / `hitl`）不受影响

## Kimi Code 接入

### MCP

`.kimi-code/mcp.json` 是 Kimi Code 官方的项目级 MCP 配置位置，新会话自动加载。生成的配置形如：

```json
{
  "mcpServers": {
    "<project>-kimi-dev-tools": {
      "command": "<projectRoot>/node_modules/.bin/tsx",
      "args": ["<projectRoot>/.kimi-code/scripts/mcp-server.ts"],
      "cwd": "<projectRoot>",
      "env": { "NODE_ENV": "development" }
    }
  }
}
```

Server 名自动按项目生成：`<项目名>-kimi-dev-tools`（项目名取自 package.json name 或目录名，**上限 15 个字符**，超出时按完整英文单词 / 中文拼音边界截取，不在词中间切断）。可用 `--mcp-name` 自定义。

### Hooks

Kimi Code 的 hooks 规则写在用户级 `~/.kimi-code/config.toml`（`[[hooks]]` 数组），**不读取项目内 settings.json**。`init` 会生成 `.kimi-code/hooks.toml`，把其中的 `[[hooks]]` 段追加到 `~/.kimi-code/config.toml` 后重启会话即可：

```bash
cat .kimi-code/hooks.toml >> ~/.kimi-code/config.toml
```

> 合并前请确认没有重复的 `[[hooks]]` 段；命令以项目根为工作目录，使用相对路径 `.kimi-code/hooks/*.mjs`。

## 前置要求（目标项目）

- Node.js >= 20（hooks 为零依赖 `.mjs`，直接 `node` 运行）
- `tsx` 与 `@modelcontextprotocol/sdk` 已作为本包 dependencies 随安装自动带上，MCP server 开箱即用
  - npm 会把 `tsx` 提升到 `<项目>/node_modules/.bin/tsx`；pnpm 若未生成该 bin，请补 `pnpm add -D tsx`，或把 `.kimi-code/mcp.json` 的 `command` 改为可用的 tsx 路径（`init` 会检测并提示）
- **重启会话 / 新建会话**使 hooks 与 MCP 生效
- 项目级 MCP server 在不受信任目录中会在信任提示里列出启动命令；确认后才会连接

## 包内容

| 目录/文件 | 说明 |
|---|---|
| `templates/kimi-code/hooks/` | 14 个零依赖 `.mjs` hooks（危险命令拦截 / 敏感文件锚定 / HITL 双哨兵 / Stop 频控 / 文档 schema 校验） |
| `templates/kimi-code/scripts/` | `mcp-server.ts`（单文件，41 个工具）、`plan-status-bridge.ts`（无 DB 活跃 Plan 判定）、`mcp-cli.sh`、`tools/*.json` |
| `templates/kimi-code/templates/` | ADD 工作流模板：plan / add-route / spec / tasks / checklist / handoff / review / hitl / PRD / contract / report 等，含 `schema.json` |
| `templates/kimi-code/rules/` | `AGENTS.md` / `project_rules.md` / `theory-practice-map.toml` |
| `templates/kimi-code/skills/` | `add-paradigm` / `session-init` |
| `templates/kimi-code/agents/` | `add-flow-guardian` |
| `templates/kimi-code/vocabulary/` | ADD 治理词汇表（触发词 → 操作） |
| `templates/kimi-code/settings.json` | Claude 风格的 hooks 配置（参考/兼容用；Kimi Code 请用 `hooks.toml`） |
| `templates/kimi-code/hooks.toml` | Kimi Code `[[hooks]]` 配置片段，合并到 `~/.kimi-code/config.toml` |
| `templates/kimi-code/mcp.json` | 项目级 MCP 配置模板（渲染后写入 `.kimi-code/mcp.json`） |
| `templates/kimi-code/sync-policy.json` | `check_spec_sync` 拦截策略（DPS 80 / RAHS 90） |

## 与 add-coder 0.3.40 对齐

本版把资产全量对齐到 [add-coder](https://github.com/xiaomingming92/add-coder) **v0.3.40**，并保留 flash 的无 DB 形态：

- **Hooks**：14 个 `.mjs` 重新烘焙，包含 0.3.33–0.3.40 的修复与能力（Stop 弹框频控、文档 schema 校验层、危险命令/敏感文件/重定向拦截、HITL 双哨兵）
- **模板**：全套 0.3.40 模板（新增 PRD / collab-contract / fix-verification / report / runtime-report / TERMINOLOGY / ports 等），`review-implementation` 含 §6.2 接线可达性核对（[W] 判据）
- **Skills**：`add-paradigm` / `session-init` 升级到 0.3.40 结构，已按无 DB 形态改写落库/记忆措辞
- **Rules**：`project_rules` / `AGENTS` / `theory-practice-map` 同步 0.3.40
- **MCP Server**：在原有 26 个工具之上新增 15 个文件化工具（见下），并回灌网关修复：
  - Plan 版本配对（多版本共存时取版本最高，不再恒命中 v1）
  - `check_spec_sync` / `check_rahs` 使用 `git diff --name-only -z`（非 ASCII 路径不再被引号/八进制转义干扰）
  - DPS 阈值对齐 `dps-scoring-rules.toml`：PASS=80 / WARN=65
  - `.toml` 纳入附录白名单
- **无 DB 适配**：`ADD_MEMORY_RECALL_MODE` 默认 `off`；不提供 L1/L2 记忆子系统；Plan / Review / Contract / Lifecycle 状态落 `.kimi-code` 下的 JSON 索引

### 新增文件化 MCP 工具

| 工具 | 说明 |
|---|---|
| `query_audit_logs` | 0.3.40 命名；从 `.kimi-code` 文档提取审计记录（`planKeyword` / `keyword` / `targetType` / `action` / `targetId`） |
| `get_hook_events` | 读取 `.kimi-code/reports/hook-events.jsonl`，按 Plan / hook / 时间过滤 |
| `plan_track` | 扫描 Plan / tasks / checklist，写入 `plans/.state/plans.json` |
| `plan_status` | 返回最新活跃 Plan 的进度与产物路径 |
| `plan_sync` | 逐 Plan 校验 spec/tasks/checklist/handoff/add-route 缺口 |
| `plan_round_status` / `plan_round_close` | 施工轮次查询与关闭（`rounds.json`） |
| `plan_update` | Plan 生命周期 `ACTIVE / CLOSED / REOPENED` 唯一入口（`lifecycle.json`） |
| `review_track` / `review_status` / `review_sync` | Review P0/P1/回流统计与索引 |
| `contract_track` / `contract_status` | 并发协作契约解析与索引 |
| `render_hitl_approval` | 生成可离线打开的 HITL HTML（注入 `window.__WIDGET_DATA__`） |
| `generate_audit_logger` | 生成无 DB 审计日志器（console + file JSONL） |

### 无 DB 状态文件

| 路径 | 内容 |
|---|---|
| `.kimi-code/plans/.state/plans.json` | Plan 扫描索引 |
| `.kimi-code/plans/.state/lifecycle.json` | Plan 生命周期与 revision |
| `.kimi-code/plans/.state/rounds.json` | 施工轮次 |
| `.kimi-code/plans/.state/reviews.json` | Review 索引 |
| `.kimi-code/plans/.state/contracts.json` | 契约索引 |
| `.kimi-code/plans/.state/lifecycle-events.jsonl` | 生命周期/轮次事件流 |
| `.kimi-code/reports/hook-events.jsonl` | Hook 拦截事件 |
| `.kimi-code/reports/audit-*.jsonl` | 审计日志（`generate_audit_logger` 生成） |

## 从 v1.0.x 迁移

v1.1.0 起部署目录由 `.qoder/` 改为 `.kimi-code/`，并移除了 QoderCN 专用的 `.qoder-cn/`：

```bash
# 1. 删除旧目录（确认没有需要保留的业务文档后）
rm -rf .qoder .qoder-cn
# 2. 重新铺设
npx add-coder-flash init --force
# 3. 合并 hooks
cat .kimi-code/hooks.toml >> ~/.kimi-code/config.toml
```

> 旧项目中的 `plans / specs / reviews / hitl` 若在 `.qoder/` 下，迁移前先手工移动到 `.kimi-code/`，`init` 不会删除或覆盖业务目录。

## 借鉴与致谢

本包的 hooks / 模板 / 治理体系借鉴了 [add-coder](https://github.com/xiaomingming92/add-coder)：

- 14 个 `.mjs` hooks 为 add-coder v0.3.40 的 Node 版烘焙产物（零外部依赖，含危险命令拦截 / 敏感文件锚定 / HITL 双哨兵 / Stop 频控 / schema 校验）
- `plan-status-bridge.ts` 为适配无数据库场景的轻量定制（文件系统活跃 Plan 判定），输出契约与 add-coder 一致
- ADD 工作流模板、skills、rules、vocabulary 沿用 add-coder v0.3.40 的模板体系
- 单文件 MCP server 为无 DB 定制版；Plan / Review / Contract / Lifecycle 工具以文件索引替代 Prisma 持久化

## 更新记录

### v1.1.0（2026-10-27）

- **同步**：资产全量对齐 add-coder v0.3.40（hooks / templates / skills / rules / vocabulary / agents）
- **变更**：部署目录 `.qoder/` → `.kimi-code/`，MCP server 名后缀 `-qoder-dev-tools` → `-kimi-dev-tools`
- **移除**：QoderCN 专用的 `.qoder-cn/mcp.json` 双写；Kimi Code 直接读取 `.kimi-code/mcp.json`
- **新增**：`.kimi-code/hooks.toml`（Kimi Code `[[hooks]]` 配置片段）
- **新增**：15 个文件化 MCP 工具（plan / review / contract / lifecycle / hook events / HITL 渲染 / 审计日志器）
- **修复**：Plan 版本配对、`git diff -z` 非 ASCII 路径、DPS 阈值 80/65、`.toml` 附录白名单
- **无 DB 适配**：memory 注入默认关闭；状态落 `.kimi-code` JSON 索引与 reports 日志

### v1.0.4（2026-08-22）

- **新增**：init 自动生成 `<目标项目>/.qoder-cn/mcp.json`（QoderCN 项目级 MCP 配置源，写入即被 IDE 加载）
- **修复**：spec / tasks / add-route 三个 schema.json 双 JSON 对象拼接缺陷（JSON.parse 失败 → doc-format-guard 阻断文档写入）
- **修复**：plan-status-bridge.ts 收敛语义（add-route 全 [x] 不再置 isActive=false，避免 stop-check Q4 验收分支不可达导致 Stop 死循环）
