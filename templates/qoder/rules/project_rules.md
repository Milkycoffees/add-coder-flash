---
trigger: always_on
alwaysApply: true
---
# Farm Agent Manage 项目开发规则 — 可审计开发范式（ADD）强制约束

## 规则优先级（数字越小优先级越高）

| 优先级 | 规则 | 说明 | 是否实现 | 备注 |
|--------|------|------|----------|------|
| P0 | `session-init` SKILL | 每次新对话必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` SKILL | 每次开发必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` Step 0 | 文档先行（Documentation First）| ✅ 已实现 | |
| P0 | ADD-0.2 用户代码与思想完整性 | IDE 不得结构化、匿名化或利用用户的代码与思维方式 | ✅ 已定义 | |
| P1 | MCP-5 稀疏推理 | 新对话必须调 query_audit_records | ✅ 已实现 | |
| P1 | ADD-7 开发操作审计 | 每次改代码必须调 record_dev_operation | ✅ 已实现 | |
| P1 | ADD-0.1 文档先行 | 广义文档贯穿全生命周期（Plan → Review → Spec → Code → Checklist → runtime-review → 回归校准）。具体约束见 ADD-9~ADD-12 | ✅ 已实现 | |
| P1 | ADD-0.3 自动审计机制 | 数据流转路径必须可观测，裁决层输入/输出优先 | ✅ 已实现 | Axios 拦截器实现 |
| P2 | ADD-1 可观测性优先 | 审计基础设施先于业务逻辑 | ✅ 已实现 | |
| P2 | ADD-2 阶段标记对称 | 每阶段 Start/End 成对 | ✅ 已实现 | |
| P2 | ADD-3 最小可观测单元 | 粒度细化到操作最小单元 | ✅ 已实现 | |
| P2 | ADD-4 三通道输出 | console + file + DB | 🔶 逐步覆盖 | console 全量覆盖；file/DB 通道伴随功能改动时顺势补齐 |
| P2 | ADD-5 审计数据即业务数据 | 审计指标回写业务表 | 🔶 逐步覆盖 | 核心节点已覆盖；其余业务表伴随功能改动时顺势补齐 |
| P2 | ADD-6 失败路径等价审计 | catch 块与 try 块信息密度等价 | 🔶 逐步覆盖 | `check_failure_path` MCP 工具已就绪；关键路径已覆盖，其余伴随功能改动时验证并补齐 |
| P2 | ADD-9 方向错误的成本非线性 | 方向错误发现越晚修复成本越高。方案审查是方向验证 | ✅ 已实现 | |
| P2 | ADD-10 意图与实现的语义鸿沟 | 意图与实现是两层抽象，对齐只能靠显式对照 | ✅ 已实现 | |
| P2 | ADD-11 证据的不可再生性 | 运行时上下文不可再生，证据必须优先持久化 | 🔶 待实现 | 需 runtime hook + predev 脚本 |
| P2 | ADD-12 双源头漂移的必然性 | 代码与文档无同步必漂移，漂移代价由下一个接手者承担 | ✅ 已实现 | |
| P2 | ADD-13 DPS 上游文档质量闸门 | Plan 概括度 → Review 注意力稀释 → Specs 遗漏 → 实现偏差。`check_dps`（DPS ≥ 85）在 Step 0 末尾量化阻断 | ✅ 已实现 | 2026-06-11 引入 |
| P2 | ADD-14 RAHS 下游执行健康度闸门 | 范围保真度 + 类型安全 + 审计完整度 + Spec 合规 + 阶段对称性。`check_rahs`（RAHS ≥ 90）在 Step 4/8 量化阻断 | ✅ 已实现 | 2026-06-11 引入 |
| P2 | ADD-15 add-route 闭环自检 | Step 3 代码完成后必须调用 `check_add_route_completeness` 扫描 add-route Step 完成度，防止执行遗漏。返回 complete 方可进入 Step 3.5 | ✅ 已实现 | 2026-06-11 引入 |
| P2 | ADD-17 HITL 磋商临时文件机制 | doc-format-guard 要求 Plan/Review 文件包含完整章节才放行，HITL 第一步只写总览表会被 guard 阻断。用 `{name}.temporary.md` 做磋商（不受 guard 检查），人类拍板后再写正式文件并删除 temporary.md | ✅ 已实现 | 2026-08-11 引入（文件化，无 DB） |
| P2 | ADD-18 HITL 人机审核强制规则 | Plan/Review 必须经过 HITL 审批（`create_hitl` → 人工 tongyi/bohui → `update_hitl` 确认）。无 `.tongyi-{planName}` 哨兵时 pre-tool-use hook 阻断写入正式文件。提案文件按 hitl-template.md 生成 + schema 校验 | ✅ 已实现 | 2026-08-11 引入（文件化，无 DB） |

### P0 规则：不可跳过

**session-init SKILL** 和 **add-paradigm SKILL** 是本项目所有 AI 操作的**前置条件**。
AI 助手必须先恢复到基线、找到对应的 SKILL 文件并按步骤执行，然后才能响应用户的具体需求。
任何跳过 SKILL 直接响应用户需求的行为，都是违反项目规则的。

---

### 理论→实践映射

> 完整结构化映射：`.qoder/rules/theory-practice-map.toml`（可被脚本解析验证）

| 规则 | 实践位置 | 触发时机 |
|------|---------|---------|
| ADD-0 | `project_rules.md` | 始终 |
| ADD-0.1 | `add-paradigm` Step 0 + Step 8 第二阶段 | 变更开始 / 收敛后 |
| ADD-1 | `add-paradigm` Step 2 | 编码前 |
| ADD-2 | `add-paradigm` Step 3 + MCP `check_phase_symmetry` | 编码中 / 合规检查 |
| ADD-3 | `add-paradigm` Step 3 | 编码中 |
| ADD-4 | `add-paradigm` Step 2 | 编码前 |
| ADD-5 | `add-paradigm` Step 2.2 + Step 3 | 编码前 + 编码中 |
| ADD-6 | `add-paradigm` Step 3 + MCP `check_failure_path` | 编码中 / 合规检查 |
| ADD-7 | `add-paradigm` 全程 + `session-init` Step 2 | 文件改动 / 会话启动 |
| ADD-8 | `add-paradigm` 附录 A | 文件创建时 |
| ADD-9 | `add-paradigm` Step 0 | Plan 完成后 |
| ADD-10 | `add-paradigm` Step 3.5 | checklist [T] 全部通过后 |
| ADD-11 | `session-init` Step 1 + `scripts/check-runtime-review.ts` | 运行时异常 / 会话启动 |
| ADD-12 | `add-paradigm` Step 8 | 收敛判断通过后 |
| ADD-13 | `add-paradigm` Step 0 末端 + MCP `check_dps` | Step 0 产出检查 |
| ADD-14 | `add-paradigm` Step 4 末端 + Step 8 收敛 + MCP `check_rahs` | Step 4 合规检查 / Step 8 收敛判定 |
| ADD-15 | `add-paradigm` Step 3.6 + MCP `check_add_route_completeness` | Step 3 代码完成后自检 |
| ADD-17 | `add-paradigm` 独立能力：生成 Plan + Step 0 | Plan/Review HITL 磋商时（写入 temporary.md 绕过 guard，拍板后写正式文件） |
| ADD-18 | `add-paradigm` 独立能力：生成 Plan + Step 0 + pre-tool-use §C | HITL 审批强制：create_hitl → 人工 tongyi/bohui → update_hitl 确认；hook 哨兵检查 |

---

## SKILL-1：会话初始化（session-init）

**触发条件**：每次新对话启动时，作为第一个操作执行。

SKILL 文件位于 `.qoder/skills/session-init/SKILL.md`，包含 4 个步骤：
1. 查询 `query_audit_records({})` 获取最近的开发操作记录
2. 分析审计日志推断上下文
3. 构建上下文摘要
4. 开始正常对话

**AI 必须按步骤执行，不可跳过任何一步。**

---

## SKILL-2：ADD 范式开发（add-paradigm）

**触发条件**：用户提出任何功能开发、Bug 修复、系统修改需求时。

SKILL 文件位于 `.qoder/skills/add-paradigm/SKILL.md`，包含 9 个阶段（Step 0 - Step 8），每个阶段包含若干子步骤：
0. 文档先行（Documentation First — 在编写任何代码之前更新项目文档 + 验收后回看架构文档）
1. 功能分析与审计阶段定义
2. 审计基础设施实现
3. 业务逻辑实现与审计植入
4. 审计数据验证
5. AI 自动合规检查
6. 从审计数据定位问题
7. 修复并验证
8. 收敛判断

**AI 必须按步骤执行，不可跳过任何一步。**

---

## ADD-0：范式边界与消费者定义

ADD 是**开发阶段**的编程范式，不是运行时范式。
- ADD 的反馈闭环消费者是：IDE 中的 AI 助手 + 编程人员
- AI 助手消费审计数据：自动检查合规性、调整代码生成策略、提示修复方向
- 编程人员消费审计数据：从审计数据定位问题根因、判断功能是否收敛
- 本项目为 **Vue 3 前端项目**，不直接操作数据库，审计数据通过 Git 提交记录和 Plan/Spec 文档承载

---

## ADD-0.1：广义文档先行（Documentation First）

**文档不是开发结束后写的，而是贯穿开发全生命周期的证据链。**

广义"文档"包括：Plan、Review、Spec、Checklist、runtime-review、架构文档。它们不是参考资料，而是开发流程的强制产物，每一步产出都对应一条规则：

| 阶段 | 规则 | 产物 |
|------|------|------|
| Plan 后 | ADD-9 方向错误的成本非线性 | `review-template.md` |
| Code 后 | ADD-10 意图与实现的语义鸿沟 | `review-implementation-template.md` → `review-runtime.md` |
| Deploy 后 | ADD-11 证据的不可再生性 | `review-runtime.md`（异常自动追加） |
| Converge 后 | ADD-12 双源头漂移的必然性 | 架构文档最终校准 |

详细流程约束见下文 ADD-9~ADD-12。

### 适用范围

以下变更必须执行文档先行流程。如果纯 Bug 修复（不涉及接口、合约、外部行为变更）可以跳过，但必须在 Plan 中说明理由。

| 变更类型 | 必须更新的文档 | 说明 |
|---------|--------------|------|
| 新增页面/模块 | README + 路由文档 | 功能描述、页面结构 |
| 修改页面/模块 | README + 路由文档 | 功能描述变更、交互变更 |
| 删除页面/模块 | README | 废弃项标记、兼容性说明 |
| 架构重构 | README | 组件职责、数据流、依赖关系 |
| API 接口变更 | API 文档 | 接口合约、请求/响应格式 |
| Store/状态管理变更 | README | 状态结构、Action/Mutation 定义 |
| 路由变更 | README | 路由路径、权限配置 |
| 规范/规则变更 | 规范文档 | 约束规则、编码规范、流程规范 |

### 项目文档分类

| 类别 | 目录 | 内容 |
|------|------|------|
| 需求文档 | `docs/*/knowledge/00-需求/` | PRD、规划说明书、功能需求 |
| 架构文档 | `docs/*/knowledge/01-架构/` | 架构说明书、系统设计、模块定义 |
| 规范文档 | `docs/*/knowledge/02-规范/` | 开发规范、AI 核心规范、状态机规范 |

**此外，ADD 工作流的核心产物由 `.qoder/templates/` 下的模板定义**，这些模板不是参考资料，而是每次变更必须产出的文档骨架。分析变更影响范围时，必须同步确认需要创建/更新哪些模板产物：

| 模板 | 用途 | 对应阶段 |
|------|------|---------|
| `simple-plan-template.md` | 精简版 Plan：≤3 文件单一改动，Tasks+Handoff 融合在 Plan 体内，无需独立 spec/handoff 文件 | 简单任务 |
| `standard-plan-template.md` | 标准版 Plan：多模块/跨系统/含架构设计，需独立 spec/tasks/checklist/handoff | 复杂任务 |
| `plan-template.md` | 历史兼容版 Plan（旧 plan 结构保留） | 兼容 |
| `add-route-template.md` | Plan→ADD 九阶段执行映射：Step 0-8 具体动作 + Task 映射表 + 审计阶段清单 + 依赖拓扑 | Step 0 |
| `hitl-template.md` | HITL 审批提案：维度表逐项决策（由 create_hitl 工具生成） | Plan/Review 前 |
| `spec-template.md` | 功能规格：Why / What Changes / Impact / WHEN-THEN Requirements | Step 0~1 |
| `tasks-template.md` | 任务拆分：Phase → Task → SubTask 层级 | Step 1 |
| `checklist-template.md` | 验收清单：业务检查项 + ADD 规则合规检查 + 跨项目联调检查 [T]/[R] | Step 3.5 / Step 8 |
| `review-template.md` | 方案审查（ADD-9）：元信息 + HITL 发现总览 + 问题复现 + 方案对比 + 决策结论 + 影响评估 | Plan 后 |
| `review-implementation-template.md` | 实现审查（ADD-10）：格式契约 + 组件接口 + 环境变量 + 路由权限 | Code 后 |
| `review-runtime-template.md` | 运行时纠偏（ADD-11）：发现列表 + 根因分析 + 流程改进项 + 回流确认 | Deploy 后 |
| `handoff-template.md` | 交接总览索引（指向单轮/多轮）。精简版 Plan 不需要此文件 | Step 8 后 |
| `handoff-single-round-template.md` | 单轮交接：9 章节（含恢复上下文审计查询） | 单轮变更完成后 |
| `handoff-multi-round-template.md` | 多轮交接：全局拓扑 + 每轮 13 子章节 + 收敛规则 + 启动模板 | 多轮原子事务完成后 |

> **AI 首次学习 ADD 范式时，必须读取上述全部模板文件。遗漏模板 = 遗漏范式全貌。**
>
> **精简版 Plan 特殊规则**：
> - **Handoff 融合**：使用 `simple-plan-template.md` 时，Handoff 信息直接嵌入 Plan 的 §四，**不产生**独立的 `-handoff-v1.md` 文件
> - **反作弊**：以下三条不满足任一条，必须改用 `standard-plan-template.md`：① 涉及文件 ≤ 3 个且全部在本模块内；② 无新增模块/子系统/外部依赖；③ 无需独立 spec 文档
> - **HITL 强制**：精简版 Plan 的 HITL 表必须列出实际完整文件路径（禁止"等 N 个文件"）和所有设计决策（禁止"等若干决策"）

### 审计要求

每次文档变更必须记录到审计记录（通过 `record_dev_operation` 工具），`targetType` 为 `"DOC"`，`action` 为 `"DOC_UPDATED"` 或 `"DOC_CREATED"`，`targetId` 为文档文件路径。

### 与 ADD 工作流的关系

文档先行是 ADD 工作流的**前置步骤**，在 `add-paradigm` SKILL 的 Step 0 中执行。执行顺序为：

1. **分析变更影响范围** — 确定本次变更涉及哪些文档类别
2. **查找相关项目文档** — 调用 `find_related_docs` MCP 工具搜索
3. **阅读并理解相关文档** — 逐篇阅读命中的文档
4. **更新项目文档** — 先改文档，再改代码
5. **确认文档合约一致性** — 文档中的接口/合约定义必须与即将实现的代码一致
6. **验收后回看架构文档** — 代码实现完成并验证通过后，重新阅读架构文档，确认文档中的接口/合约/数据流与最终实现一致。如有偏差：标记偏差点（差异位置 + 文档描述 vs 实际实现），**通知开发者决策**是修正代码还是修正文档，AI 不自动修改。

---

## ADD-0.3：自动审计机制（Automatic Audit Mechanism）

### 核心原则

系统的数据流转路径必须可观测、可追溯。数据经过的每一个关键节点都应留下记录，使得任意一次操作的全链路可被审计重构。

审计的目标不是记录 CRUD 操作本身，而是记录两件事：

- **数据流经事实** — 数据经过了哪些关键节点
- **业务决策结果** — 裁决逻辑的输入与输出、状态迁移的触发条件与目标状态

以上都必须自动记录。业务代码中不得出现手动的审计调用——审计是系统行为，不是业务逻辑。

### 前端实现方向

> 本项目为 Vue 3 前端项目，通过 **Axios 拦截器** 实现自动审计。具体实现在 `src/config/axios/service.ts` 的 response 拦截器中扩展，采用 **路径映射注册表模式**（`API_PATH_TARGET_MAP`）。

### 设计目标

| 目标 | 说明 |
|------|------|
| 自动覆盖 | 所有 POST/PUT/DELETE 请求自动记录，无需手动调用 |
| 注册即审计 | 新模块只需在 `API_PATH_TARGET_MAP` 中加一行映射，即刻生效 |
| 不阻塞响应 | 异步记录，失败不影响正常业务流程 |
| 成功/失败等价 | 成功路径和失败路径均有审计记录（ADD-6） |
| 路径映射 | URL → 业务域 映射表，支持跳过路径（如 login） |
| 脱敏 | 敏感字段（password/token/secret）自动替换为 `***` |

### node_ruoyi 中间件 vs 本项目 Axios 拦截器对照

```
node_ruoyi (Express 后端):                    本项目 (Vue 3 前端):

请求 → Express 中间件链                        请求 → Axios request 拦截器
  → audit 中间件拦截 POST/PUT/DELETE              → 添加 token/租户头
  → 覆盖 res.json() 捕获响应                      → 发送请求
  → 自动写入 pro_add_log 表                      → Axios response 拦截器
  → 异步写入，不阻塞                               → 处理响应/错误
                                                   → 自动 console 记录操作（开发环境）
                                                   → 错误自动 ElMessage 提示

PATH_TARGET_MAP: 路径→模块映射                  API_PATH_TARGET_MAP: 路径→模块映射
SKIP_PATHS: 跳过 login/logout 等                SKIP_PATHS: 跳过 login/refresh-token 等
METHOD_MAP: POST→CREATE, PUT→UPDATE, DELETE→DELETE  (同)
sanitizeBody: 密码脱敏                           (同)
```

### 审计输出

| 层次 | 消费者 | 输出通道 | 开关 |
|------|--------|---------|------|
| **开发环境** | 开发者 + AI 助手 | Browser Console | `import.meta.env.DEV` |
| **生产环境** | 运维人员 | 远程日志服务（可选） | 按需配置 |
| **Plan/Spec 文档** | AI 助手 + 开发者 | `.qoder/plans/` + `.qoder/specs/` | 始终 |

### 开发规范

#### 新增 API 模块时

**无需手动添加审计日志代码！** Axios 拦截器会自动处理。

只需确保：
1. API 调用使用 `service.post/put/delete` 封装
2. 响应格式包含 `code: 0` 或 `code: 200` 表示成功

#### 新增模块需要审计时

在 `API_PATH_TARGET_MAP` 中添加一行路径映射即可：

```typescript
const API_PATH_TARGET_MAP: Record<string, string> = {
  '/system/user': 'USER',
  '/system/role': 'ROLE',
  '/system/menu': 'MENU',
  '/system/dept': 'DEPT',
  '/system/post': 'POST',
  // 新增模块只需加一行
  '/your/new/module': 'YOUR_MODULE',
}
```

### 跳过审计的路径

以下路径默认跳过审计（可在 `SKIP_PATHS` 中配置）：
- `/login` — 登录
- `/refresh-token` — 刷新令牌
- `/captchaImage` — 验证码
- `/getInfo` — 获取用户信息
- `/getRouters` — 获取路由

---

## ADD-0.2：用户代码与思想完整性（User Code & Thought Integrity）

**IDE 平台不得结构化、匿名化或利用用户的代码与思维方式。**

ADD 范式产出的不仅是代码，更是编程人员的思维过程、架构决策、问题分析路径和代码组织方式。这些是用户的核心知识产权，IDE 平台无权将其结构化、匿名化后用于训练或分发。

- ADD 范式的审计数据归用户所有，不出仓库、不上传云端、不参与任何形式的匿名化处理
- 代码可以开源，但思维过程不可以被掠夺——这是 ADD 范式与 IDE 平台的根本分界线

---

## ADD-1：可观测性优先于功能实现

任何新功能或修复，必须先建立可观测性基础设施，再编写业务逻辑。
- 编码前先定义该功能的组件边界和状态结构
- 组件 props/emits 接口必须在组件实现之前定义
- 禁止出现"先写功能后补类型"的情况

## ADD-2：组件生命周期对称

每个 Vue 组件必须有对称的生命周期管理：
- `onMounted` 中创建的资源（事件监听、定时器、订阅）必须在 `onUnmounted` 中清理
- 异步请求必须有 loading/error 状态管理
- 禁止出现"创建了资源但忘记清理"的情况

## ADD-3：最小可观测单元

每个组件、每个 API 调用、每个 Store action 都应该是可独立观测的：
- 组件：props 类型定义完整，emits 事件明确
- API 调用：请求/响应类型定义完整，错误处理完备
- Store：state 类型定义完整，action 有明确的输入/输出

## ADD-4：三通道输出

前端开发的可观测性通过三个通道实现：
1. 浏览器 DevTools（Vue DevTools）— 实时开发调试
2. TypeScript 类型检查（`pnpm run ts:check`）— 编译时验证
3. ESLint + Stylelint（`pnpm run lint:eslint` + `pnpm run lint:style`）— 代码规范检查

## ADD-5：类型即文档

TypeScript 类型定义是前端代码的"审计数据"：
- 所有 API 接口必须有完整的请求/响应类型定义
- 所有组件 props 必须有完整的类型定义
- 所有 Store state 必须有完整的类型定义
- 禁止使用 `any` 类型

## ADD-6：失败路径等价处理

catch 块中的错误处理必须与 try 块具有相同的信息密度：
- 必须包含：错误信息、用户提示、恢复操作
- 禁止空 catch 或仅 `console.error(error)` 的写法
- API 调用失败必须给用户可操作的反馈（重试、回退等）

## ADD-7：开发操作审计

每次 AI 助手对代码进行修改/创建/删除操作，都应当记录操作审计。审计记录通过 `.qoder/plans/` 和 `.qoder/specs/` 中的文档承载，并通过 Git 提交记录追踪。

### 记录时机

| 操作类型 | 记录内容 |
|---------|---------|
| 页面/组件修改 | 变更的页面路径和组件结构 |
| Store 修改 | 变更的 state/action/getter |
| 路由修改 | 新增/修改的路由和权限 |
| API 接口修改 | 变更的接口定义 |
| 配置变更 | 变更的 Vite/ESLint/环境变量配置 |

## ADD-8：目录路径与文件命名约定

ADD 开发流程产生多种产物，必须按约定的目录和命名规范存放。

### 目录结构

| 目录 | 内容 | 可见性 |
|------|------|--------|
| `README.md` | 项目文档 | 公开 |
| `.qoder/plans/` | 需求方案 + 任务拆分 + handoff 交接文档（按 `{YYYY}/{MM}/{DD}/{任务名}/` 分层，同任务 plan/route/handoff 归入同一子目录） | 开发内部 |
| `.qoder/reviews/` | 方案评审（按 `{YYYY}/{MM}/{DD}/{任务名}/` 分层，与 plans 同日期结构） | 开发内部 |
| `.qoder/specs/` | 每轮 spec + tasks + checklist（三件套，按 `{YYYY}/{MM}/{DD}/` 分层） | 开发内部 |
| `.qoder/rules/` | 项目规则文件 | 开发内部 |
| `.qoder/skills/` | SKILL 行为定义 | 开发内部 |
| `.qoder/scripts/` | 工具脚本 | 开发内部 |
| `.qoder/templates/` | 文档模板（plan、spec、handoff 等） | 开发内部 |
| `.qoder/tools/` | 工具设计文档 | 开发内部 |

### 命名规范

格式：`{需求域名}-{本轮核心内容}-{产物类型}-v{版本号}`

- **需求域名** 必须与对应的需求/功能保持一致
- **产物类型** 使用英文关键词：`plan`（方案）、`review`（评审）、`handoff`（交接）
- 单个需求的所有文件共享同一需求域名前缀

### Handoff 文件

Handoff 文件是新对话启动时 AI 恢复上下文的入口索引，详见 `.qoder/templates/` 下的模板：

- **单轮变更** → `handoff-single-round-template.md`
- **多轮原子事务** → `handoff-multi-round-template.md`

Handoff 文件的每个轮次章节 MUST 包含：当前轮次位置、上游已完成交付物、spec 文件链接、修改文件清单、核心设计、高风险误区、恢复上下文审计查询步骤、验证标准、ADD-7 审计记录。

**此外，ADD 工作流的核心产物由 `.qoder/templates/` 下的 12 个模板定义**，这些模板不是参考资料，而是每次变更必须产出的文档骨架。分析变更影响范围时，必须同步确认需要创建/更新哪些模板产物：

| 模板 | 用途 | 对应阶段 |
|------|------|--------|
| `plan-template.md` | 需求方案：元信息 + 背景目标 + 方案选型 + 架构设计 + 实施步骤 + 验收标准 | 需求理解 |
| `add-route-template.md` | Plan→ADD 九阶段执行映射：Step 0-8 具体动作 + Task 映射表 + 审计阶段清单 + 依赖拓扑 | Step 0 |
| `spec-template.md` | 功能规格：Why / What Changes / Impact / WHEN-THEN Requirements | Step 0~1 |
| `tasks-template.md` | 任务拆分：Phase → Task → SubTask 层级 | Step 1 |
| `checklist-template.md` | 验收清单：业务检查项 + ADD 规则合规检查 + 跨项目联调检查 [T]/[R] | Step 4 / Step 8 |
| `review-template.md` | 方案审查（ADD-9）：元信息 + 问题复现 + 方案对比 + 决策结论 + 影响评估 | Plan 后 |
| `review-implementation-template.md` | 实现审查（ADD-10）：接口契约 + 框架版本 + 组件接口 + 环境变量 + 路由权限 | Code 后 |
| `review-runtime-template.md` | 运行时纠偏（ADD-11）：发现列表 + 根因分析 + 流程改进项 + 回流确认 | Deploy 后 |
| `handoff-template.md` | 交接总览索引（指向单轮/多轮） | Step 8 后 |
| `handoff-single-round-template.md` | 单轮交接：9 章节（含恢复上下文审计查询） | 单轮变更完成后 |
| `handoff-multi-round-template.md` | 多轮交接：全局拓扑 + 每轮 13 子章节 + 收敛规则 + 启动模板 | 多轮原子事务完成后 |

> **AI 首次学习 ADD 范式时，必须读取上述全部 12 个模板文件。遗漏模板 = 遗漏范式全貌。**

### 文档增量修订规则

Plan、Spec、Handoff 文档的修改必须使用**增量更新**格式，不得覆盖原内容后无迹可查：

- 旧内容使用 `~~删除线~~` 标记，不删除原文
- 新内容紧跟其后，使用 `→` 引导
- 末尾标注修订日期和修订原因

**格式**：

```
~~旧内容~~ → 新内容 [2026-06-09 修订: 修订原因]
```

**Review 回流标记（强制）**：Review 结论回流至 Plan 时，每个回流点必须在 Plan 对应处标注 `[回流: Review {P0/P1} #{编号} {简述}]`（如 `[回流: Review P1 #6 实施顺序调整]`），供 DPS 扫描器计数回流完整度。回流标记可与增量修订合并——修订原因段包含 `Review` 关键字即视为有效标记。

**适用范围**：plan、execution、handoff、spec、tasks、checklist 的全部修订。

**原则**：
- 每一个修订点必须是独立的增量行，不与相邻修订行混排
- 禁止整段覆盖后只改一句话——读者无法判断哪里变了
- 单次修订涉及多处变更时，每处独立标记，不合并

### 协作文档交互规则

详见 `add-paradigm` SKILL 附录 A（`.qoder/skills/add-paradigm/SKILL.md`）：
- handoff 是入口索引，spec 是具体实现的权威来源
- handoff 与 spec 冲突时以 spec 为准
- checklist 逐项勾选必须与 handoff 验证标准同步更新
- ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_records` 回查确认落库

### ADD 工作流三大阶段与目录对应

```
需求理解 + 任务拆分 → .qoder/plans/
    ↓
评审                → .qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/
    ↓
Spec 执行           → .qoder/specs/
```

---

## ADD-9：方向错误的成本非线性

**方向错误发现得越晚，修复成本越高——Plan 阶段的纠正和编码后的纠正，代价差距是指数级的。**

代码写完后发现方向错误，意味着已经投入的时间和精力全部沉没。方案审查就是方向验证——它不关心实现细节，只关心决策是否正确。方案审查失败的唯一代价是重新 Plan，这比重写整个实现便宜得多。

---

## ADD-10：意图与实现的语义鸿沟

**意图（设计）和实现（代码）是两层抽象，对齐只能靠显式对照，不能靠推断。**

编译器能验证语法正确性，但无法验证"做的是不是该做的"——这是语义层的问题。跨系统的接口对齐、框架 breaking change、组件 Props/Emits 不一致，这些编译期不可见但运行时致命的错误，不会出现在任何类型错误里。如果跳过对照直接交付，遗漏的问题会在运行时暴露，此时修复代价呈指数增长。

---

## ADD-11：证据的不可再生性

**运行时上下文是不可再生的——浏览器控制台日志滚动、页面刷新、状态变化会在几分钟内消灭证据。**

人类对错误的记忆是损耗性、自纠偏的——"刚才那个报错是什么来着"是最常见的 Debug 起点。机器捕获的证据是确定性的，但证据窗口稍纵即逝。证据落盘后，Debug 可以等、可以换人、可以跨会话；没落盘的证据永远消失了。这不仅是一个技术原则，也是一个认知原则——证据是客观的，记忆是主观的。

---

## ADD-12：双源头漂移的必然性

**任何双源头系统（代码 + 文档）缺乏同步机制必漂移。漂移的代价由下一个接手者全额承担，而非作者——这是结构性的道德风险。**

实现过程中一定有偏离设计的决策（妥协、优化、意外发现）。这些偏差不会报错、不会崩溃，只会沉默地积累，让下一个接手的人花三倍时间理解系统。关闭偏差不是削足适履，也不是放任漂移，而是显式标记差异并交由决策——因为只有人才能判断"文档过时了"还是"代码写错了"。

---

## ADD-13：DPS 上游文档质量闸门

**Plan 概括不是美德，是债务。Plan 每缺一个细节，下游就要脑补一次，注意力就被稀释一分。**

从 Plan → Review → Specs → 代码实现，存在一条注意力衰减链：Plan 粗粒度 → Review 需自行展开细节 → 注意力被多维度稀释 → Review 只覆盖部分维度 → 缺口进入 Specs → Step 3 实现时发现缺口 → 临时补 → 敷衍 → 与 Plan 脱节。

DPS（Documentation Precision Score）在 Step 0 末尾量化上游文档质量，三维判定：
- Plan 可执行粒度（30%）：每个 Phase 有独立验收标准、每个 Task 指定具体文件、无占位词
- Review 覆盖完备度（35%）：覆盖 Plan 的 7 个架构维度
- Specs 精确度（35%）：Requirements 数与 Plan Phase 数 1:1 映射

**执行方式**：`check_dps({ planKeyword: "..." })`。DPS ≥ 85 进入 Step 1；70–84 回退补齐；< 70 回退细化 Plan。

---

## ADD-14：RAHS 下游执行健康度闸门

**代码实现的质量可以用范围扩散、类型错误、审计漏记三个信号量化。这三个信号合在一起就是注意力漂移的指纹。**

RAHS（Round Attention Health Score）在 Step 4 末尾和 Step 8 收敛时量化本轮执行健康度，五维判定：
- 范围保真度（30%）：计划文件与修改文件的交集/计划文件数
- 类型安全（20%）：`max(0, 100 − tscErrors × 10)`
- 审计完整度（25%）：record_dev_operation 调用数 / 计划文件数
- Spec 合规（15%）：check_spec_sync 通过/失败
- 阶段对称性（10%）：check_phase_symmetry 通过/失败

**执行方式**：`check_rahs({ planKeyword: "..." })`。RAHS ≥ 90 进入下一阶段；70–89 自检；< 70 注意力漂移严重，强制返工 Step 3。

**DPS 是 RAHS 的先决条件**：DPS 不过，不要指望 RAHS 能过——不要进入 Step 3。

---

## ADD-15：add-route 闭环自检

**add-route 是 Plan 与代码实现之间的唯一映射表。Step 3 产出检查只验证代码级审计植入，不验证 add-route 文档本身的 Step 执行完整度。**

AI 可能在完成 Step 3 代码后标记 Task 为 ✅ 但跳过 Step 4/5/6/8 的文档闭环。ADD-15 要求 Step 3 代码实现全部完成后，强制调用 `check_add_route_completeness` 扫描 add-route 文件内容，统计所有 `[ ]` vs `[x]`，确保没有任何 Step 被遗漏。

**四种返回状态**：
- `complete` — 所有 Step 产出项全部 [x]，进入 Step 4
- `incomplete` — 存在未勾选项，逐 Step 完成未闭环项后重新调用
- `file_missing` — 未找到 add-route 文件，回退 Step 0.5
- `errors` — 文件存在但解析出错，检查格式

**执行方式**：`check_add_route_completeness({ planKeyword: "..." })`。与 `check_add_route_status`（Step 3 前置守卫）形成首尾互锁——前者确认 add-route 存在，后者确认 add-route 闭环。

---

## ADD-17：HITL 磋商临时文件机制

**HITL 第一步只写总览表（HITL 计划总览）时，会被 doc-format-guard 的章节完整性校验阻断**——因为正式模板要求全部章节。

用 `{name}.temporary.md` 做磋商载体：

1. 生成 `{planName}.temporary.md`（只含 HITL 总览表 + 待决策维度），**不受 guard 检查**
2. 人类在 temporary 文件（或对话）中逐项拍板
3. 拍板后生成正式 Plan/Review 文件（含全部章节），并**删除 temporary.md**

> **为什么需要**：doc-format-guard 是 ADD 文档质量的最后防线，但它无法区分"磋商中"与"已完成"。temporary.md 是两者之间的显式状态通道。

---

## ADD-18：HITL 人机审核强制规则

**Plan / 方案 Review 必须经过 HITL 审批，未审批不得写入正式文件。**

### 流程（文件化，无 DB）

```
create_hitl({ planName, type: "PLAN"|"PLAN_REVIEW", dimensions })   → 生成 .qoder/hitl/{planName}.hitl.md 提案 + 状态 json（DRAFT，round 自动递增）
  ↓ 人类审核提案文件（或对话中直接说 同意/驳回）
update_hitl({ planName, type, status: "TONGYI"|"BOHUI", reason?, _fallback: true })
  → TONGYI 写哨兵 .qoder/hitl/.tongyi-{planName}（pre-tool-use §C 门禁放行）
  → BOHUI 写 .bohui-{planName} + 记录 reason，create_hitl 新建 round 重新发起
status_hitl({ planName, type })                                     → 查询状态
```

### 哨兵门禁（hooks 联动）

- **pre-tool-use §C**：写入 `.qoder/plans/`（除 handoff）或方案 Review 前，检查 `.qoder/hitl/.tongyi-{planName}` 哨兵是否存在；不存在 → 阻断（exit 2）并提示先走 HITL
- **post-tool-use §1**：check_dps ≥ 85 自动建哨兵（DPS 达标即视为方案质量通过，可免人工再审）
- **session-start §③**：启动时检测待审批提案（`.qoder/hitl/*.hitl.md`）并提示
- **review-template / review-implementation-template**：含 HITL 发现总览表，需 HITL 审批；review-runtime 不走 HITL

### 终态规则

- TONGYI/BOHUI 为终态，不可再更新；BOHUI 后必须 `create_hitl` 新建 round
- 哨兵双命名（原始 planName + hook 剥离后缀名），确保 pre-tool-use 推导名与工具写入名一致

---

## 项目技术约束

### 技术栈

| 技术 | 用途 | 版本 |
|------|------|------|
| Vue | 前端框架 | 3.5.x |
| Vite | 构建工具 | 8.x |
| TypeScript | 类型系统 | 6.x |
| Element Plus | UI 组件库 | 2.13.x |
| Pinia | 状态管理 | 3.x |
| Vue Router | 路由管理 | 5.x |
| Axios | HTTP 客户端 | 1.16.x |
| UnoCSS | 原子化 CSS | 66.x |
| Vue I18n | 国际化 | 11.x |

### 代码质量

- TypeScript 类型检查必须通过（`pnpm run ts:check`）
- ESLint 检查必须通过（`pnpm run lint:eslint`）
- Stylelint 检查必须通过（`pnpm run lint:style`）
- 禁止 `any` 类型（必须显式定义）
- 新增文件必须在项目已有目录结构内，遵循现有命名规范

### 组件规范

- Vue 组件使用 `<script setup lang="ts">` 语法
- 组件 props 必须使用 TypeScript 泛型定义
- 组件 emits 必须使用 TypeScript 泛型定义
- 组件文件命名使用 PascalCase（如 `UserList.vue`）
- 页面文件命名使用 PascalCase（如 `Index.vue`）
- 每个组件只负责一个明确的功能

### API 规范

- API 接口定义在 `src/api/` 目录下，按业务模块分目录
- 每个 API 模块导出类型定义和请求函数
- 请求函数使用 `service.get/post/put/delete` 封装
- 响应类型必须显式定义

### Store 规范

- Store 模块定义在 `src/store/modules/` 目录下
- 使用 Pinia `defineStore` 定义
- state 类型必须显式定义
- action 必须有明确的参数和返回值类型

### 路由规范

- 路由定义在 `src/router/index.ts`
- 路由 meta 必须包含 title 和 icon
- 权限路由使用 `roles` 字段控制

---

## MCP 开发工具集（MCP Dev Tools）

项目提供 MCP Server（`farm-qoder-dev-tools`），运行在 stdio 通道上，为 AI 助手提供项目上下文感知能力。

### 配置文件

MCP 配置位于 `.qoder/mcp.json`，MCP Server 脚本位于 `.qoder/scripts/mcp-server.ts`。

### 启动方式

使用 `pnpm tsx .qoder/scripts/mcp-server.ts`，或通过 IDE 自动加载（`.qoder/mcp.json` 配置）。

MCP Server 启动时会：
1. 尝试加载 `.env.development` 或 `.env` 环境变量（通过 dotenv）
2. 输出启动信息横幅和工具列表
3. 显示 `PROJECT_ROOT` 路径用于调试

---

## Hooks 体系（Qoder 客户端事件驱动）

项目通过 `.qoder/settings.json` 注册 Qoder hooks，在 IDE 事件触发时自动执行 `.qoder/hooks/` 下的脚本，实现 ADD 状态的自动注入与守卫：

### 注册事件

| 事件 | 脚本 | 作用 |
|------|------|------|
| SessionStart | `session-start.sh` | 启动时注入活跃 ADD Plan 状态 + 模板清单 + HITL 待审批提示 |
| UserPromptSubmit | `prompt-submit.sh` | 开发触发词路由：无 Plan 提示启动 ADD；有 Plan 注入轮次/Step 状态 |
| PreToolUse | `pre-tool-use.sh` + `doc-format-guard.sh` | 写文件前守卫：危险命令拦截 / 敏感文件保护 / plans 写入需活跃 Plan / HITL 哨兵门禁（ADD-18）/ 文档格式校验 |
| PostToolUse | `post-tool-use.sh` + `doc-format-guard.sh` | 写文件后提醒：ADD-7 审计落库 / DPS ≥ 85 自动建 HITL 哨兵 / devlog 提醒 |
| PostToolUseFailure | `post-tool-failure.sh` | 工具失败提示 |
| Stop | `stop-check.sh` | 四象限验收检查：无 Plan 改代码阻断 / 验收未闭环阻断 / 通过清理标记 |
| SubagentStart/Stop | `subagent-guard.sh` | 子代理 ADD 上下文注入 |
| PreCompact | `pre-compact.sh` | 压缩前保存 ADD 恢复状态 |
| Notification | `notification.sh` | Review 提醒 |
| PermissionRequest | `permission-gate.sh` | 高风险工具二次确认提示 |

### 运行前提

- 依赖 **Qoder 客户端 hook 机制**（settings.json 注册，事件触发时执行脚本）
- hooks 脚本全部走 `.qoder/` 文件系统 + `/tmp` 标记文件，**无数据库、无网络**
- JSON 解析用 macOS 自带 `jq`（/usr/bin/jq）
- hooks 已适配 macOS（bash 3.2 + BSD grep，无 `grep -P`/`md5sum` 依赖）

### 标记文件（/tmp）

| 标记 | 用途 |
|------|------|
| `add_dev_{hash}` | dev action 标记：PreToolUse 写入，Stop/SessionEnd 读取 |
| `add_tpl_{hash}` | 模板注入去重标记（同会话不重复注入） |
| `add_recovery_{hash}` | PreCompact 保存的 ADD 恢复状态 |

---

### 工具列表

| 工具名 | 功能 | 对标来源 |
|--------|------|---------|
| `get_project_context` | 获取项目全文上下文（技术栈、目录结构、规则） | farm-agent + node_ruoyi |
| `get_vue_component_info` | 获取 Vue 组件结构（Props/Emits/生命周期） | 前端专属 |
| `get_route_definition` | 获取 Vue Router 路由定义 | node_ruoyi（适配） |
| `get_api_definition` | 获取 API 接口模块定义（类型 + 函数） | 前端专属 |
| `find_related_docs` | 搜索 .qoder/ 文档（规则/计划/Spec） | farm-agent + node_ruoyi |
| `check_phase_symmetry` | 检查组件生命周期对称性（ADD-2） | farm-agent + node_ruoyi（适配 Vue） |
| `check_failure_path` | 检查错误处理完备性（ADD-6） | farm-agent + node_ruoyi |
| `query_audit_records` | 从 Plan/Spec 文档中查询开发审计记录 | farm-agent + node_ruoyi（适配无 DB） |
| `record_dev_operation` | 记录开发操作到 Plan 文档审计日志 | farm-agent + node_ruoyi（适配无 DB） |
| `check_implementation_alignment` | 检查代码实现与 Spec 意图对齐（ADD-10） | 新增（ADD-10 落地） |
| `scan_runtime_reviews` | 扫描运行时纠偏文档未关闭发现（ADD-11） | 新增（ADD-11 落地） |
| `check_spec_drift` | 检测 Spec 与代码之间的漂移（ADD-12） | 新增（ADD-12 落地） |
| `get_add_template` | 读取 ADD 模板文件内容（plan/add-route 等） | farm-agent（ADD 工作流） |
| `check_add_route_status` | add-route 存在性交叉校验（Step 3 前置守卫） | farm-agent（ADD-15） |
| `check_add_route_completeness` | add-route Step 完成度自检闭环（Step 3.6） | farm-agent（ADD-15） |
| `check_dps` | DPS 上游文档质量闸门（Step 0 末端） | farm-agent（ADD-13） |
| `check_rahs` | RAHS 下游执行健康度闸门（Step 4/8） | farm-agent（ADD-14） |
| `create_hitl` | HITL 审批：创建提案（文件化，无 DB） | add-coder（ADD-18，前端化） |
| `update_hitl` | HITL 审批：更新状态 TONGYI/BOHUI + 写哨兵 | add-coder（ADD-18，前端化） |
| `status_hitl` | HITL 审批：查询状态 | add-coder（ADD-18，前端化） |

### 与后端项目的差异

| 维度 | farm-agent / node_ruoyi | farm-agent-manage |
|------|------------------------|-------------------|
| 数据库 | Prisma / Sequelize + MySQL | 无（纯前端） |
| 数据存储 | AuditLog / pro_add_log 表 | Plan 文档 + Spec 文档 |
| 审计方式 | `query_audit_logs` 查 DB | `query_audit_records` 读文档 |
| 记录方式 | `record_dev_operation` 写 DB | `record_dev_operation` 追加到 Plan 文档 |
| 测试环境 | 需要 Docker + DB | 只需 pnpm + Node.js |
| 启动方式 | `tsx .qoder/scripts/mcp-server.ts` | `tsx .qoder/scripts/mcp-server.ts` |

### 设计原则

1. **无数据库依赖** — MCP Server 不依赖任何数据库，所有数据通过项目文件系统承载
2. **审计文件化** — 审计记录写入 Plan/Spec 文档，可被 Git 追踪
3. **工具聚焦前端** — 专属工具针对 Vue 3 组件开发场景设计
4. **保持兼容** — `get_project_context`、`find_related_docs`、`check_*` 等通用工具与后端项目保持接口一致

### MCP 约束规则

#### MCP-1：上下文优先

AI 助手在生成任何代码前，必须先调用以下工具获取真实信息，不得凭记忆假设：
- `get_project_context` — 获取项目结构、技术栈、可用脚本
- `get_vue_component_info` — 获取 Vue 组件 Props/Emits/生命周期
- `get_route_definition` — 获取路由定义
- `get_api_definition` — 获取 API 接口定义
- `find_related_docs` — 查找与变更相关的项目文档（ADD-0.1 文档先行）

#### MCP-2：编码中验证

AI 助手在生成包含组件的代码后，必须调用验证工具检查合规性：
- `check_phase_symmetry` — 验证 ADD-2 生命周期对称性
- `check_failure_path` — 验证 ADD-6 失败路径处理
- `check_implementation_alignment` — 验证 ADD-10 实现与 Spec 意图对齐
- `check_spec_drift` — 验证 ADD-12 Spec 与代码无漂移

#### MCP-3：工具调用链

AI 助手遵循"调用工具 → 获得结果 → 编码 → 验证"的闭环流程：
1. 调用 `get_project_context` 获取项目上下文
2. 调用 `get_vue_component_info` / `get_api_definition` 获取现有接口
3. 编码业务逻辑
4. 调用 `check_phase_symmetry` 和 `check_failure_path` 验证（ADD-2/ADD-6）
5. 调用 `check_implementation_alignment` 验证实现对齐（ADD-10）
6. 调用 `check_spec_drift` 检查 Spec 漂移（ADD-12）
7. 如有不合规则修正后重新验证

#### MCP-4：稀疏推理恢复（Sparse Inference Recovery）

AI 助手在**每次新对话启动时**，必须先执行 `.qoder/skills/session-init/SKILL.md`（SKILL-1 会话初始化），作为**不可跳过的前置操作**。

`session-init` SKILL 的 Step 1 要求调用 `scan_runtime_reviews` 工具扫描未关闭的运行时纠偏发现，Step 2 要求调用 `query_audit_records` 工具查询开发操作审计记录，以恢复开发上下文。

#### MCP-5：Plan 命名与审计策略

每个 Plan（计划文件）必须包含以下元信息：

```markdown
## PLAN 元信息
- **Plan 名称**: {功能英文名}-{序号} (如 user-list-pagination-v1)
- **启动时间**: {YYYY-MM-DD HH:mm:ss}
- **主导 AI**: {AI 助手标识}
- **ADD-7 审计策略**: 列出本次 Plan 涉及的文件及其 audit action
```

---

## 禁止项

1. **不可使用 `any` 类型**
2. **不可在 catch 块中只做 console.error 而不做用户提示**
3. **不可跳过 TypeScript 类型检查直接提交代码**
4. **不可修改已有的路由权限配置核心逻辑**
5. **不可在组件中直接操作 DOM（使用 Vue 响应式）**
6. **不可在 `onUnmounted` 中遗漏资源清理**
7. **不可在 API 调用中硬编码 URL（使用环境变量）**

---

## 代码风格

- 使用 ES Module 规范（import/export）
- 变量命名使用 camelCase
- 文件名使用 PascalCase（组件）或 camelCase（工具函数）
- 每个文件只导出一个主要模块（单一职责）
- 组件使用 Composition API + `<script setup>` 语法

---

## 项目目录结构

```
src/
├── api/              # API 接口定义（按业务模块分目录）
│   ├── login/
│   ├── system/
│   │   ├── user/
│   │   ├── role/
│   │   ├── menu/
│   │   ├── dept/
│   │   └── post/
│   └── ...
├── assets/           # 静态资源
│   ├── imgs/
│   └── svgs/
├── components/       # 公共组件
│   ├── Card/
│   ├── Form/
│   ├── Icon/
│   └── Map/
├── config/           # 配置
│   └── axios/        # Axios 配置
├── directives/       # 自定义指令
├── hooks/            # 组合式函数
│   └── web/          # 通用 hooks
├── layout/           # 布局组件
├── locales/          # 国际化
├── plugins/          # 插件
│   ├── echarts/
│   ├── svgIcon/
│   ├── unocss/
│   └── vueI18n/
├── router/           # 路由配置
├── store/            # Pinia 状态管理
│   └── modules/
├── styles/           # 全局样式
├── types/            # 类型定义
├── utils/            # 工具函数
├── views/            # 页面组件
│   ├── Error/
│   ├── Home/
│   ├── Login/
│   ├── Profile/
│   └── ...
├── App.vue           # 根组件
├── main.ts           # 入口文件
└── permission.ts     # 权限控制
```
