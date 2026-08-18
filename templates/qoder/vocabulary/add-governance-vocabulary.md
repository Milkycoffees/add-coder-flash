# ADD 治理词汇表 (ADD Governance Vocabulary) — agrisynapse 前端版

> **目的**：LLM 听到以下触发词时零额外 prompt 执行正确操作（L1 预埋）。
> **消费者**: IDE 侧 LLM + 未来治理 AI
> **维护**: 单一真值源，被 `.qoder/rules/project_rules.md` 引用。
> **本项目为 Vue 3 前端项目**：无数据库，审计文件化（record_dev_operation 写入 Plan 文档，query_audit_records 读文档）。

## 优先级说明

| 优先级 | 含义 | 触发行为 |
|--------|------|---------|
| 🔴 P0 | 必须预埋 | 听到即执行，不可跳过 |
| 🟡 P1 | 应该预埋 | 听到即执行，少数场景可确认 |
| 🟢 P2 | 可选预埋 | 听到时优先执行，不确定可查文档 |

---

## 类别 A: 文档类型

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `Plan` / `plan` / `计划` | **模板选择**：≤3 文件、无新模块/架构 → `simple-plan-template.md`（Tasks+Handoff 融合，无需独立 spec/handoff）；多模块/跨系统/含架构 → `standard-plan-template.md`。**HITL 前置**：生成前调 `create_hitl({ planName, type: "PLAN", dimensions })`，人类 tongyi 后（哨兵 `.qoder/hitl/.tongyi-{planName}`）方可写入正式 Plan |
| P0 | `Spec` / `spec` / `规格书` | 查 `.qoder/specs/{任务名}/spec.md` |
| P1 | `Tasks` / `tasks` / `任务清单` | 查 `.qoder/specs/{任务名}/tasks.md` |
| P1 | `Checklist` / `checklist` / `验收单` | 查 `.qoder/specs/{任务名}/checklist.md` |
| P0 | `Review` / `review` / `评审文档` | 查 `.qoder/reviews/` 下 `*-review*.md`。方案 Review 需 HITL 审批（`create_hitl({ planName, type: "PLAN_REVIEW" })`） |
| P1 | `review-implementation` | 查 `.qoder/reviews/` 下 `*-review-implementation*.md` |
| P1 | `review-runtime` | 查 `.qoder/reviews/` 下 `*-review-runtime*.md` |
| P0 | `Handoff` / `handoff` / `交接` / `交接书` | 查 `.qoder/plans/` 下 `*-handoff*.md`（精简版 Plan 无独立 handoff，融合在 §四） |
| P0 | `add-route` / `执行路线图` / `路线图` | 调 `check_add_route_status({ planKeyword })` → 读 `.qoder/plans/` 下 `*-add-route*.md` |
| P0 | `devlog` / `开发日志` / `devlog记录` | **双触发**: ①用户说即写 → 调 `record_dev_operation` 落库审计 + 更新 handoff 验收记录；②Step 8 收敛通过后 → **必须自动写**（无需用户提醒） |
| P0 | `增量更新` / `增量` / `修改文档` | 修改已有 Plan/Spec/Review/handoff 文档时，**必须用增量修订格式**：旧内容 `~~删除线~~` → 新内容 `[日期 修订: 原因]`，禁止直接覆盖 |
| P1 | `hitl` / `HITL` / `审批提案` | 读 `.qoder/hitl/{planName}.hitl.md`；状态查询调 `status_hitl` |

## 类别 B: ADD 阶段

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `开发` / `改功能` / `修.?bug` / `fix.?bug` / `加需求` / `新增` / `重构` / `实现` / `接入` / `改造` / `升级` / `加个` / `添加功能` / `新建` / `改一下` / `修改.*逻辑` / `优化.*代码` / `对接` / `迁移` / `重写` / `implement` / `refactor` / `feature` | 开发任务检测——无活跃 ADD 时提示启动 add-paradigm SKILL |
| P0 | `实施` / `开始实施` / `进入实施` | Plan 就绪后 → 进入 add-paradigm SKILL → 从当前 Step 开始执行。无活跃 add-route 先回 Step 0.5 生成 |
| P0 | `继续` | **上下文锁定**：沿用上一条 AI 消息中明确提出的 Step/操作。**禁止**将 "继续" 理解为"跳到代码编写（Step 3）" |
| P1 | `Step 0` / `文档先行` | 分析变更 → 更新文档 → 生成 add-route → DPS 门禁 |
| P1 | `Step 1` / `功能分析` | 确定业务阶段 → 定义前端审计点（组件生命周期/Store action/Axios 拦截） |
| P1 | `Step 2` / `审计基础设施` | 确认审计通道可用（Axios 拦截器 + 文件化记录） |
| P1 | `Step 3` / `业务逻辑实现` | add-route 前置守卫（`check_add_route_status`）→ 代码实现 + 审计打点 |
| P1 | `Step 3.5` / `实现审查` | checklist [T] 项 → review-implementation + review-runtime |
| P1 | `Step 4` / `审计验证` | `check_phase_symmetry` + `check_failure_path` + RAHS 门禁 |
| P1 | `Step 5` / `合规检查` | AI 自动检查 ADD 原则合规性 |
| P1 | `Step 6` / `定位问题` | 从审计记录/证据推断根因 |
| P1 | `Step 7` / `修复验证` | 修复 → 重新验证 |
| P0 | `Step 8` / `收敛判断` / `验收` | 五步闭环：checklist 全部 [x] → tasks 完成 → review-runtime [R] 项确认 → ROUND_CLOSED 审计 → devlog + handoff + 架构回看。**不可只做 handoff 不写审计** |
| P1 | `原子闭包` / `双层闭包` | 原子闭包判定：Plan 级（业务功能完整）+ 轮次级（文件边界独立、可独立验证） |
| P1 | `生成plan` / `写plan` / `创建plan` | 读模板（simple/standard）→ `create_hitl` 审批 → 生成 Plan → check_dps |
| P1 | `勾选checklist` / `更新checklist` / `checklist打勾` | 按 checklist.md 逐项验证并勾选 [x]，禁止空勾选，需附证据 |
| P1 | `更新handoff` / `写handoff` / `handoff更新` | 更新 handoff §验证标准 + 审计记录 + query_audit_records 回查命令 |
| P1 | `生成route` / `写add-route` / `创建路线图` | 从 add-route-template 生成，填充 Task 映射表 + ADD-7 策略 + 依赖拓扑 |
| P1 | `tongyi` / `同意审批` / `驳回` / `bohui` | HITL 审批决策：`update_hitl({ planName, type, status: "TONGYI"|"BOHUI", _fallback: true })`，TONGYI 写 `.tongyi-{planName}` 哨兵，BOHUI 后 create_hitl 新建 round |

## 类别 C: 门禁/闸门

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `DPS` / `DPS闸门` | 调 `check_dps({ planKeyword: "..." })`，DPS ≥ 85 通过 |
| P0 | `RAHS` / `RAHS闸门` | 调 `check_rahs({ planKeyword: "..." })`，RAHS ≥ 90 通过 |
| P0 | `Guardian` / `门禁` / `add-flow-guardian` | 调 `add-flow-guardian` Subagent（入口或出口模式） |
| P1 | `add-route 闭环` / `闭环自检` | 调 `check_add_route_completeness({ planKeyword: "..." })` |
| P1 | `BLOCKED` / `阻断` | 守卫返回 BLOCKED → 回退修复对应 Step，不得继续 |
| P0 | `Review 回流` / `0.6.5` | Review P0/P1 问题必须写回 Plan + Specs（增量修订 + `[回流: Review P0 #x]` 标记） |

## 类别 D: MCP 工具（高频）

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `get_project_context` | 调 `get_project_context` 获取项目上下文（技术栈/目录/规则） |
| P0 | `query_audit_records` | 按 keyword/targetId/targetType 查询开发审计记录（文件化，无 DB） |
| P0 | `record_dev_operation` | 记录开发操作到 Plan 文档审计日志（ADD-7） |
| P0 | `create_hitl` / `update_hitl` / `status_hitl` | HITL 审批三件套：创建提案 / 更新状态（TONGYI/BOHUI）+ 写哨兵 / 查询状态 |
| P1 | `check_dps` | DPS 闸门（Step 0 末尾） |
| P1 | `check_rahs` | RAHS 闸门（Step 4/8） |
| P1 | `check_add_route_status` | add-route 存在性校验（Step 3 前） |
| P1 | `check_add_route_completeness` | add-route Step 完成度扫描（Step 3 后） |
| P1 | `check_phase_symmetry` | 组件生命周期对称性验证（ADD-2） |
| P1 | `check_failure_path` | 失败路径等价审计验证（ADD-6） |
| P2 | `check_spec_sync` / `find_related_docs` / `get_add_template` / `get_vue_component_info` / `get_route_definition` / `get_api_definition` / `check_implementation_alignment` / `check_spec_drift` | P2 低频工具：按需查阅 MCP 工具列表 |
| P1 | `查审计` / `查日志` / `查记录` | 同 `query_audit_records` |
| P1 | `记录操作` / `记操作` / `写操作日志` | 同 `record_dev_operation` |

## 类别 E: Skills / Subagents

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `session-init` / `会话初始化` / `恢复会话` / `恢复上下文` | 执行 session-init SKILL（新对话第一步，不可跳过） |
| P0 | `add-paradigm` / `ADD范式` / `启动ADD` / `开始ADD流程` / `按ADD来` | 执行 add-paradigm SKILL（开发任务入口，不可跳过） |
| P0 | `add-flow-guardian` / `Guardian` | 调起门禁 Subagent |

## 类别 F: 核心概念

| 优先级 | 触发词 | LLM 含义 |
|:--:|------|---------|
| P0 | `收敛` / `收敛判断` / `验收通过` | Step 8：全条件满足 → ROUND_CLOSED 审计 → devlog → handoff → 架构回看 闭环 |
| P1 | `阶段对称` | ADD-2：组件生命周期 Start/End 成对，调 `check_phase_symmetry` |
| P1 | `失败路径` | ADD-6：catch 块信息密度 ≥ try 块（错误信息+用户提示+恢复操作），调 `check_failure_path` |
| P1 | `稀疏推理` | 通过 `query_audit_records` + hooks 状态注入稀疏恢复开发上下文 |
| P1 | `planKeyword` | add-route / check_dps / check_rahs 的定位关键词，取自 Plan 核心功能名 |
| P1 | `三通道` | 前端可观测三通道：Vue DevTools + `pnpm run ts:check` + ESLint/Stylelint |
| P1 | `审计落库` / `审计完整性` | 每个修改文件必须有 record_dev_operation 记录，每轮完成后 query_audit_records 回查 |
| P1 | `收敛条件` / `验收条件` | Step 8 全条件：tsc 通过 + checklist 全部 [x] + RAHS ≥ 90 + add-route 闭环 |

---

## Few-Shot 示例

> 以下为 LLM 最容易误解的高频场景，每个场景给出标准输入 → 标准输出映射。

### 场景 1: 验收后缺闭环（最高频遗漏）

**错误输出**：
```
用户: "验收通过"
LLM: "所有 checklist 项 [x]，RAHS ≥ 90。验收通过！" [对话结束]
```

**正确输出**（四步闭环，缺一不可）：
```
LLM: ① 调 record_dev_operation（ROUND_CLOSED）落库审计
     ② 更新 handoff 写入验收记录（本轮改了什么 + 验收结果 + 遗留项）
     ③ 架构文档回看 → 确认文档不落后于代码（ADD-12）
     ④ 更新 add-route Step 8 [x] → check_add_route_completeness 自检
```

### 场景 2: Plan 生成不走 HITL

**错误输出**：
```
用户: "生成 plan"
LLM: "好的，读模板生成 plan..." [直接写 .qoder/plans/xxx-plan-v1.md]
```

**正确输出**：
```
LLM: "先创建 HITL 提案 → create_hitl({ planName, type: "PLAN", dimensions })"
→ 人类 tongyi（哨兵 .qoder/hitl/.tongyi-{planName} 生成）→ 才写正式 Plan
→ 写入前 pre-tool-use hook 校验哨兵，无哨兵阻断（exit 2）
```

### 场景 3: 小改动误用标准 Plan

**错误输出**：
```
用户: "把登录页按钮颜色改一下"
LLM: "生成 standard Plan + Specs 三元组 + handoff..." [过度流程化]
```

**正确输出**：
```
LLM: "单文件改动 → 用 simple-plan-template.md（Tasks+Handoff 融合）
     → create_hitl 审批 → 执行 → 收敛"
```
