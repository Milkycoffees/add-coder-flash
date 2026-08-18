# add-coder-flash

> 仓库：https://github.com/Milkycoffees/add-coder-flash

**超级轻量**的 ADD 编程范式脚手架：核心工作流零依赖（hooks 为纯 node .mjs，无需数据库），安装即铺设，一条命令把 hooks / templates / rules / skills 等资产部署到目标项目，开箱即用。

轻量设计使其**尤其适合前端项目**，同样**适用于全栈项目**——内置 MCP server 与无 DB 桥接方案，无数据库场景开箱即用，有数据库亦可平滑衔接。

## 安装

```bash
# 作为 devDependency 安装（私有包或 git 依赖）
npm install -D add-coder-flash
# 或 pnpm
pnpm add -D add-coder-flash
```

## 使用

**安装即铺设**：`npm install` 后自动把资产铺到项目 `.qoder/`（postinstall 钩子），无需手动执行命令。

```bash
npm install -D add-coder-flash
# 或 pnpm（需 allowBuilds 放行，见下）
pnpm add -D add-coder-flash
```

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
```

铺设后：

1. 资产铺到 `<目标项目>/.qoder/`（hooks / templates / rules / skills / agents / vocabulary / tools / scripts / settings.json / sync-policy.json）
2. `mcp.json` 中的 `{{projectRoot}}` 自动渲染为目标项目绝对路径
3. 目标项目已有的业务目录（plans / specs / reviews / hitl）不受影响

## 前置要求（目标项目）

- Node.js >= 20（hooks 为零依赖 .mjs，直接 `node` 运行）
- `tsx` 与 `@modelcontextprotocol/sdk` 已作为本包 dependencies 随安装自动带上，MCP server 开箱即用
- 在 IDE 全局 MCP 配置中注册 MCP server（名称自动按项目生成：`<项目名>-qoder-dev-tools`，项目名取自 package.json name 或目录名，**上限 15 个字符，超出时按完整英文单词 / 中文拼音边界截取**（不在词中间切断；连续无分隔拼音保留完整）；见安装输出的 `🔌 MCP server` 提示；项目 `.qoder/mcp.json` 已生成，路径已渲染）
- 如需自定义名称，手动执行时可用 `npx add-coder-flash init --mcp-name <名称>` 重新生成（--force）
- 重启 Qoder 使 hooks 配置生效

## 包内容

| 目录 | 说明 |
|---|---|
| `templates/qoder/hooks/` | 14 个零依赖 .mjs hooks（危险命令拦截 / 敏感文件锚定 / HITL 双哨兵） |
| `templates/qoder/scripts/` | mcp-server.ts（单文件）、plan-status-bridge.ts（无 DB 文件系统判定）、mcp-cli.sh |
| `templates/qoder/templates/` | ADD 工作流模板（plan / spec / tasks / checklist / handoff / review 等） |
| `templates/qoder/rules/` | project_rules / AGENTS / theory-practice-map |
| `templates/qoder/skills/` | add-paradigm / session-init |
| 其余 | settings.json / sync-policy.json / agents / vocabulary / tools |

## 借鉴与致谢

本包的 hooks / 模板 / 治理体系借鉴了 [add-coder](https://github.com/xiaomingming92/add-coder)（v0.3.32）：

- 14 个 `.mjs` hooks 为 add-coder 的 Node 版烘焙产物（零外部依赖，含危险命令拦截 / 敏感文件锚定 / HITL 双哨兵）
- `plan-status-bridge.ts` 为适配无数据库场景的轻量定制（文件系统活跃 Plan 判定），输出契约与 add-coder 一致
- ADD 工作流模板（plan / spec / tasks / checklist / handoff / review）沿用 add-coder 的模板体系
