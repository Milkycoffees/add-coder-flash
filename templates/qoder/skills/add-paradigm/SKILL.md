---
name: "add-paradigm"
description: "Audit-Driven Development paradigm workflow. Invoke when starting any new feature development, bug fix, or system modification. Use when the user says: 开发、改功能、修 bug、加个需求、新增模块、重构、实现、接入、改造、升级任何系统行为. 9 phases (Step 0-8), each containing multiple sub-steps. Do NOT skip sub-steps — each numbered item under a phase must be executed."
---

# 可审计开发范式（ADD）工作流

本 Skill 引导你按照 ADD 范式完成功能开发。每次开始新功能、修复 Bug、或修改系统行为时，必须按此工作流执行。

**范式边界**（定义在 `.qoder/rules/project_rules.md` ADD-0）：
- ADD 是开发阶段编程范式，不是运行时范式
- 反馈闭环消费者：IDE 中的 AI 助手 + 编程人员
- 运行时范式（裁决层/能力模型）是独立的下一步演化

**核心原则**（始终生效，定义在 `.qoder/rules/project_rules.md`）：
- ADD-0：范式边界与消费者定义
- ADD-0.1：广义文档先行（Documentation First）— Plan → Review → Spec → Code → Checklist → runtime-review → 回归校准。详细流程约束见 ADD-9~ADD-12
- ADD-1：可观测性优先于功能实现
- ADD-2：阶段标记对称（前端：组件生命周期对称）
- ADD-3：最小可观测单元
- ADD-4：三通道输出（前端：DevTools + tsc + lint）
- ADD-5：类型即文档（前端版审计数据）
- ADD-6：失败路径等价审计
- ADD-7：开发操作审计
- ADD-9：方向错误的成本非线性
- ADD-10：意图与实现的语义鸿沟
- ADD-11：证据的不可再生性
- ADD-12：双源头漂移的必然性
- ADD-13：DPS 上游文档质量闸门
- ADD-14：RAHS 下游执行健康度闸门
- ADD-15：add-route 闭环自检
- ADD-17：HITL 磋商临时文件机制
- ADD-18：HITL 人机审核强制规则

### 深层参考文档

以下项目文档提供了 ADD 范式的完整工作流说明，执行 ADD 流程时优先查阅：

| 文档 | 路径 | 用途 |
|------|------|------|
| 项目规则（ADD-0~18 全量定义） | `.qoder/rules/project_rules.md` | 规则优先级、前端技术约束、MCP 工具、Hooks 体系 |
| 治理词汇表（触发词→操作） | `.qoder/vocabulary/add-governance-vocabulary.md` | 触发词路由、Few-Shot 场景 |
| 模板清单（preload 注入） | `.qoder/templates/` | 每次生成文档前重读对应模板 |

---

## 独立能力：生成 Plan + Specs 三元组

> **Plan 不绑定 ADD 工作流。** Plan 只在需要开启一个正式的开发任务（新功能、Bug 修复、系统改造）时才生成。问项目架构、看脚本、查天气等日常交互不需要 plan。
>
> **触发条件**：用户说"生成plan"/"生成计划"/"创建一个plan"。无需额外声明"按ADD规范"——本步骤已内化全部约定。
>
> **Plan 是后续 ADD 工作流的输入。** 生成 plan 后如需执行，才启动下方 Step 0。
>
> **Plan 生成必须联动 Specs 三元组（标准版强制）**：Plan 定义"做什么"，Specs 定义"怎么做"。使用 `standard-plan-template.md` 时，**生成 Plan 必须同步生成对应 Specs 三元组**（spec.md + tasks.md + checklist.md），缺一不可。使用 `simple-plan-template.md`（精简版）时无需独立 Specs——Tasks 已融合在 Plan 体内。

### 步骤 1：HITL 审批（强制，ADD-18）

> **MUST NOT 跳过。** 所有 Plan 生成必须先经人类审批，未审批不得写入正式 Plan 文件。

1. **调用 `create_hitl` 创建审批提案**（前置条件：无——文件化实现，直接创建即可）：
   ```
   create_hitl({ planName: "{planName}", type: "PLAN", dimensions: [{name, content}, ...] })
   ```
   - `dimensions` 由 LLM 根据对话动态生成（影响模块/预估文件数/架构变更/新增依赖/风险等级/预计轮次/审计策略/验收标准 等维度）
   - 工具生成 `.qoder/hitl/{planName}.hitl.md` 提案文件 + 状态 json（DRAFT，round 自动递增）
2. **人类审核**：提示用户打开提案文件逐项审核，或在对话中直接说"同意"/"驳回"
3. **更新审批状态**：
   ```
   update_hitl({ planName: "{planName}", type: "PLAN", status: "TONGYI"|"BOHUI", reason?, _fallback: true })
   ```
   - TONGYI：写哨兵 `.qoder/hitl/.tongyi-{planName}`（pre-tool-use hook §C 放行后续正式文件写入）
   - BOHUI：写 `.bohui-{planName}` + reason，然后 `create_hitl` 新建 round 重新发起
4. **查询状态**（可选）：`status_hitl({ planName, type })`

> **交互模式说明**：Qoder 客户端不支持 inputRequired 弹框协议，统一使用 `_fallback: true` 降级模式——提案文件即审批载体。**BOHUI 后必须 create_hitl 新建 round，禁止直接修改已终态提案。**

### 步骤 2：模板选择与生成 Plan

1. **模板选择**：根据任务复杂度选模板
   - **精简版** `simple-plan-template.md`：≤3 文件、无新模块/架构、无外部 API 契约变更。Tasks+Handoff 融合在 Plan 体内，无需独立 spec 文件
   - **标准版** `standard-plan-template.md`：多模块、跨系统集成、含架构选型或数据模型设计
   - **反作弊**：以下三条不满足任一条，必须改用标准版：① 涉及文件 ≤ 3 个且全部在本模块内；② 无新增模块/子系统/外部依赖；③ 无需独立 spec 文档
2. **读取模板**：读选定的模板文件，禁止凭记忆
3. **命名规范**：`{项目名}-{功能名}-plan-v1.md` → `.qoder/plans/{YYYY}/{MM}/{DD}/`（按启动时间的年月日自动分层）
4. **必含章节（标准版）**：
   - PLAN 元信息（名称/时间/关联文档/ADD-7审计策略表）
   - HITL 计划总览（人类拍板入口，文件路径必须完整列出）
   - 一、背景与目标 / 二、方案选型 / 三、架构设计（含 Plan→Spec 实施映射表）/ 四、实施 Task + 依赖图 / 五、验收标准 / 六、关联文档
5. **必含章节（精简版）**：
   - HITL 计划总览（一次性提交人类审核）
   - 一、Plan 概述 / 二、变更范围 / 三、Tasks（合并）/ 四、Handoff（融合）/ 五、验收标准 / 六、关联
6. **文档链路**：plan 作为枢纽节点，必须包含与后续 review/handoff 的双向链接占位
7. **记录审计**：plan 生成后调用 `record_dev_operation`（targetType: "PLAN"）

### 步骤 3：生成 Specs 三元组（标准版联动，不可跳过）

> **MUST NOT 跳过。** 使用标准版 Plan 时，Plan 生成后必须立即生成 Specs 三元组。Plan 是 Specs 的上游输入，没有 Specs 的 Plan 是残废的——下游 AI 拿到 Plan 后不知道具体该改哪些文件、每个 Task 的验收标准是什么。

1. **创建 Specs 目录**：`.qoder/specs/{YYYY}/{MM}/{DD}/{功能名}/`（与 Plan 同日期分层，功能名用小写中划线）
2. **读取模板并生成**：
   - 读 `spec-template.md` → 生成 `spec.md`（Why / What Changes / Impact / Boundaries / Requirements）
   - 读 `tasks-template.md` → 生成 `tasks.md`（Preconditions / Forbidden / Tasks / Dependencies / Verification）
   - 读 `checklist-template.md` → 生成 `checklist.md`（验收清单，逐项可追溯到 tasks.md，[T] 编译期 / [R] 运行时）
3. **内容约束**：
   - `spec.md` 的 Requirements 必须与 Plan §四实施 Task 1:1 对应
   - `tasks.md` 的每个 Task 必须指定具体改动文件路径
   - `checklist.md` 的 [T] 编译期检查项必须覆盖 tasks.md 每个 Task 的验证标准
4. **Plan 回写**：Plan §六关联文档中的 Spec / Tasks / Checklist 路径必须指向刚生成的三元组
5. **记录审计**：每个文件生成后调用 `record_dev_operation`（targetType: "SPEC"）

### 步骤 4：产出检查

- [ ] HITL 审批已通过（`.qoder/hitl/.tongyi-{planName}` 哨兵存在）
- [ ] Plan 已生成（`.qoder/plans/{YYYY}/{MM}/{DD}/{功能名}/`）
- [ ] 标准版：Specs 三元组已生成（spec.md + tasks.md + checklist.md 齐全）；精简版：Tasks+Handoff 已融合在 Plan 体内
- [ ] Plan §六关联文档已指向 Specs 三元组
- [ ] Plan §四实施 Task 与 tasks.md 的 Task 一一对应
- [ ] `record_dev_operation` 已为 Plan + 3 个 Specs 文件分别调用

---

## ADD 工作流入口

> **以下 Step 0~8 在"按 plan 执行开发"时才启动。** 日常问答不进入此流程。

---

## Step 0：文档先行（Documentation First）

> Step 0 分两个阶段：**第一阶段**在编写任何代码之前，更新项目文档使其反映即将实现的变更；**第二阶段**在 Step 8 收敛判断通过后，回到架构文档做最终校准。两个阶段缺一不可。

### 0.0 跨轮上下文恢复（新 Session / 稀疏上下文必执行）

> **触发条件**：新对话首次进入 ADD 工作流、用户提到"上次""之前""回顾""继续"等跨轮语义、或上下文明显稀疏（无本轮 Plan 细节）。

**检测链路**：`session-init` SKILL + `SessionStart` hook 检测到活跃 Plan 时，自动提示 AI 执行以下流程。

当检测到稀疏上下文时，MUST 调用以下工具重建完整上下文：

```text
① check_plan_status({ planKeyword }) → Plan 文档存在性 + 任务进度
② check_add_route_status({ planKeyword }) → add-route Step 完成度
③ status_hitl({ planName, type: "PLAN" }) → 审批是否已 tongyi/bohui
④ 汇总三结果 → AI 确定：上次做到哪个 Step、有哪些未闭环项、审批是否通过
```

**调用顺序**：① → ② → ③，汇总后即可进入后续 ADD 步骤，无需人工确认。`SessionStart` hook 也会自动注入活跃 Plan 状态（Plan/轮次/Step/handoff 路径）。

### 第一阶段：实施前项目文档更新

#### 0.1 分析变更影响范围

确定本次变更涉及的业务域和功能范围，列出受影响的文档类别：

| 文档类别 | 目录位置 | 典型文件 |
|---------|---------|---------|
| 需求文档 | 项目 README / 需求说明 | PRD、功能描述 |
| 架构文档 | 项目 README / 设计文档 | 组件职责、数据流、路由结构 |
| 规范文档 | `.qoder/rules/project_rules.md` | 开发规范、编码约束 |

**此外，ADD 工作流的核心产物由 `.qoder/templates/` 下的模板定义**，这些模板不是参考资料，而是每次变更必须产出的文档骨架。分析变更影响范围时，必须同步确认需要创建/更新哪些模板产物：

| 模板 | 用途 | 对应阶段 |
|------|------|---------|
| `simple-plan-template.md` | 精简版 Plan（≤3 文件，Tasks+Handoff 融合） | 简单任务 |
| `standard-plan-template.md` | 标准版 Plan（多模块/架构设计） | 复杂任务 |
| `add-route-template.md` | Plan→ADD 九阶段执行映射：Step 0-8 具体动作 + Task 映射表 + 审计阶段清单 + 依赖拓扑 | Step 0 |
| `spec-template.md` | 功能规格：Why / What Changes / Impact / WHEN-THEN Requirements | Step 0~1 |
| `tasks-template.md` | 任务拆分：Phase → Task → SubTask 层级 | Step 1 |
| `checklist-template.md` | 验收清单：业务检查项 + ADD 规则合规检查 | Step 3.5 / Step 8 |
| `review-template.md` | ADD-9 方向验证：元信息 + HITL 发现总览 + 问题复现 + 方案对比 + 决策结论 + 影响评估 | Review 关卡 |
| `review-implementation-template.md` | ADD-10 语义对齐：元信息 + HITL 发现总览 + 格式契约 + 组件接口 + 环境变量 + 路由权限 | Code 后 |
| `review-runtime-template.md` | ADD-11 证据持久化：发现列表 + 根因分析 + 流程改进项 + 回流确认 | Deploy 后 |
| `handoff-template.md` | 交接总览索引（指向单轮/多轮）。**精简版 Plan 不需要此文件** | Step 8 后 |
| `handoff-single-round-template.md` | 单轮交接：9 章节（含恢复上下文审计查询） | 单轮变更完成后 |
| `handoff-multi-round-template.md` | 多轮交接：全局拓扑 + 每轮 13 子章节 + 收敛规则 + 启动模板 | 多轮原子事务完成后 |

> **AI 首次学习 ADD 范式时，必须读取上述全部模板文件。遗漏模板 = 遗漏范式全貌。**
>
> **每次根据模板生成文档时（plan/spec/review/handoff），MUST 先重新读取对应的模板文件，再填充内容。禁止凭记忆生成——模板可能已在迭代中更新，记忆中的版本可能不完整。**

#### 0.2 搜索相关项目文档

调用 MCP 工具 `find_related_docs` 查找与当前变更相关的项目文档：

```
find_related_docs({ query: "功能关键词" })
```

预期产出：
- 匹配的项目文档列表（路径 + 标题 + 摘要）
- 按相关性排序的文档列表

#### 0.3 阅读并理解相关文档

逐篇阅读命中的文档，重点关注：
- 与本次变更直接相关的章节
- 文档中定义的接口、合约、数据流
- 依赖关系和约束条件

#### 0.4 更新项目文档（文档先行）

**在修改代码之前，先更新项目文档，使文档反映即将实现的变更。** 包含但不限于：

- **新增功能**：补充 README 功能描述 → 更新路由/组件设计 → 更新规范约束
- **修改功能**：修改 README 功能描述 → 更新组件接口定义 → 更新 API 调用说明
- **删除功能**：标记 README 废弃项 → 删除路由/组件 → 更新兼容性说明

#### 0.5 生成 ADD 执行路线图（add-route）

> **add-route 是 Plan 和 Handoff 之间的桥梁**：它将 Plan 的抽象 Task 映射到 ADD 九阶段的每一步具体动作。

调用 `get_add_template({ template: "add-route-template" })` 读取模板，然后按以下内容填充：

1. **元信息**：绑定 Plan + Spec + Tasks + Handoff 路径
2. **Step 0~2 状态**：根据当前执行进度填写（首次生成时仅 Step 0 标记为进行中，Step 1~8 为待执行）
3. **Step 3 Task 映射表**：从 `tasks.md` 提取每个 Task 的改动文件、审计植入点、依赖关系
4. **ADD-7 审计策略**：从 Plan 元信息 ADD-7 策略表复制，逐文件填写 targetType/action/beforeState/afterState
5. **文件清单**：汇总所有涉及文件的 targetType 和操作类型

**命名**：`{需求域名}-{核心内容}-add-route-v1.md` → `.qoder/plans/{YYYY}/{MM}/{DD}/{功能名}/`（与 Plan 同一任务子目录）

**关键约束**：
- [ ] add-route 必须先于任何代码变更生成（Step 3 依赖 add-route 中的审计阶段清单）
- [ ] Task 映射表必须与 `tasks.md` 完全一致（不能漏 Task、不能多 Task）
- [ ] 依赖拓扑必须与 Plan §四对齐
- [ ] 每个 ADD-7 文件的 beforeState/afterState 必须描述该文件在本次变更前后的具体差异
- [ ] 生成后调用 `record_dev_operation`（targetType: "PLAN"，action: "DOC_CREATED"）

#### 0.6 确认文档合约一致性

每次文档更新必须遵循以下原则：

- [ ] 文档更新在代码变更之前完成
- [ ] 需求文档、架构文档、规范文档中与变更相关的部分已同步更新
- [ ] 文档中的接口/合约定义与即将实现的代码一致
- [ ] 如果本次变更不需要修改项目文档，在注释中说明理由（例如：纯 bug 修复不影响外部合约）
- [ ] 文档更新后，调用 `record_dev_operation` 记录文档变更（`targetType: "DOC"`）

#### 0.6.5 Review 结论回流至 Plan 与 Specs（强制卡位）

> **MUST NOT 跳过。** Plan Review 的结论如果只留在 Review 文件里、不写回 Plan 体，下游 AI 读 Plan 时看到的仍是未修正的原始版本——等于没做 Review。
>
> **核心原则**：Review 是诊断报告，Plan 是治疗方案。诊断报告的结论必须写进治疗方案，病人才能按修正后的方案治疗。

**什么时候触发**：
- Plan Review 已生成（`.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/...` 存在）
- Review 中有 P0/P1/P2 问题清单
- 人类已确认 Review 结论（通过评审）

**回流步骤**：

1. **读取 Review 的问题清单**：提取所有 P0/P1/P2 问题的编号、描述、修复建议
2. **逐问题判定回流目标**：

   | Review 问题类型 | 回流到 Plan 的什么位置 | 回流到 Specs 的什么位置 |
   |:--|:--|:--|
   | 架构设计缺口（如缺失字段、签名不明确） | Plan §三架构设计中对应子章节 | Spec §Requirements 中对应 Requirement |
   | 实施步骤缺口（如 roadmap 不完整） | Plan §四实施 Task 新增 | Spec §What Changes 新增改动项 |
   | 范围/边界缺口 | Plan 新增补充说明 | Spec §Boundaries 更新禁止项 |
   | P0 文档缺失（add-route/specs/handoff） | Plan §六关联文档更新引用路径 | 如 Specs 已补建则无需修改 |
   | 编号/命名冲突 | Plan §四 Task Group | 对应更新 |

3. **逐问题写入 Plan**：
   - P0 问题：必须在 Plan 中显式关闭（补引用、补文件）
   - P1 问题：必须在 Plan 中显式响应（接受并修改，或接受并推迟并给出理由）
   - P2 问题：建议响应，非强制但不响应需在 Plan 中标记为 "已知不处理"
   - **不要**简单复制 Review 文字——要把修复建议转成 Plan 的具体文字
   - **增量修订（强制）**：回流涉及修改已有内容时（非新增），必须遵循增量修订规则——旧内容用 `~~删除线~~` 包裹保留，新内容紧跟后以 `→` 引导，末尾标注 `[修订日期: 修订原因]`。**禁止直接删除或覆盖原文**
   - **回流标记（强制）**：每个回流点必须在 Plan 对应处标注 `[回流: Review {P0/P1} #{编号} {简述}]`，供 DPS 扫描器计数回流完整度。示例：`[回流: Review P1 #6 实施顺序调整]`
4. **逐问题写入 Specs**：Review 发现 Requirements 层面缺口 → Spec §Requirements 新增 WHEN-THEN Scenario；Boundaries 层面缺口 → 更新 Spec §Boundaries
5. **验证回流完整性**：
   - 对 Review 中每个 P0/P1 问题，确认能在 Plan/Specs 中找到对应的"已修正后的文字"
   - 调用 `check_dps({ planKeyword: "..." })` 确认 DPS ≥ 85——如果回流后 DPS 仍然不达标，说明 Review 本身覆盖度不足或回流遗漏
6. **记录审计**：调用 `record_dev_operation`（`targetType: "PLAN"`，`action: "DOC_UPDATED"`，`beforeState`: Review 问题编号列表，`afterState`: 每个问题的回流位置）

**反例（禁止出现）**：
- Plan 写 `fetchUserList() 签名扩展`，Review 指出签名不明确 → 回流后 Plan 仍然写同样的文字 ❌
- Review 发现缺少字段，Specs 补了但 Plan §三数据流图仍然是旧版 ❌

> **为什么这个卡位是强制性的**：与 ADD-12（代码后回看架构文档）形成对称——ADD-12 防止"代码改了但文档没改"的漂移，0.6.5 防止"Review 发现了问题但 Plan 没改"的漂移。文档的双源（Plan + Code）之外还有第三个源（Review），三源之间的回流如果不闭环，任何一源都会成为漂移的起点。

#### 0.7 原子闭包判定（强制卡位）

> **MUST NOT 跳过。** 在进入 Step 1 代码实现前，必须对 Plan 中的 Task Groups 执行双层闭包判定。

原子闭包分两层：
- **Plan 级闭包**：整个 Plan 交付的完整业务功能是什么。一个 Plan 对应一个 Plan 级闭包，Plan 之间不重叠。判定标准：用户可感知的完整业务功能，任缺其一则价值不完整。
- **轮次级闭包**：每个轮次的改动边界是什么。一轮内的文件改动不越界、不污染其他轮次，每轮可独立验证（tsc + eslint + checklist）。

> ⚠️ **常见错误**：把"用户能用吗"当作轮次拆分的唯一标准，导致"都不能用所以合并成一轮"的错误合并。正确的做法是：Plan 级用业务价值判定，轮次级用文件边界和独立验证判定——**同一个文件只归属到一个轮次**，轮次 N+1 只消费轮次 N 的产出，不回头修改轮次 N 的文件。

**判定输入**：`tasks.md` 中的 Task Groups + Plan §一业务功能描述。

**Step 1：Plan 级闭包确认**

| 问题 | 判定 |
|------|------|
| 这个 Plan 描述的是几个完整的业务功能？ | 一个 → 单 Plan 级闭包；多个 → 拆成多个 Plan |
| 有没有"缺了 A 则 B 不可用"的 Plan 间硬依赖？ | 有 → Plan 边界错误，应合并 |

**Step 2：轮次级闭包划分**

1. **逐文件归属**：把每个 Task 涉及的文件列出来，同一个文件只归属到一个轮次
2. **依赖方向检查**：轮次 N+1 只消费轮次 N 的产出，不回头修改轮次 N 的文件
3. **独立验证**：每个轮次完成后可通过 `pnpm run ts:check` + `pnpm run lint:eslint` + checklist [T] 项独立验证

**判定产出**（写入 add-route）：

```
原子闭包判定
══════════
Plan 级闭包: {业务功能描述}
轮次: {N} 轮

第1轮: {轮次名称} ({文件数} 文件)
  文件边界: {文件列表}
  上轮依赖: 无
  可独立验证: tsc + eslint + checklist [{X} 项]

第2轮: {轮次名称} ({文件数} 文件)
  文件边界: {文件列表}
  上轮依赖: 消费第1轮产出的 {类型/接口/函数}
  可独立验证: tsc + eslint + checklist [{X} 项]
```

**Step 3：选择 handoff 模板**

| 轮次数 | 模板 | 说明 |
|:--:|------|------|
| 1 | `handoff-single-round-template.md`（9 章节） | Plan 内只有 1 轮，所有文件在一次闭包内完成 |
| ≥2 | `handoff-multi-round-template.md`（每轮 13 子章节） | Plan 内有多个轮次，每轮有独立的文件边界和验证标准 |

> 绝大多数 Plan 都会有 ≥2 轮——因为即使业务功能简单，类型定义和调用方修复通常会自然形成两个独立文件边界。single-round 主要用于纯 Bug 修复或单文件改动。

**判定失败的处理**：
- 若 Plan 级闭包判定不通过（"缺 A 则 B 不可用"）→ 回退 Plan，合并为同一个 Plan
- 若某轮次文件归属冲突（同一文件被多轮同时修改）→ 回退 Plan，重新划分轮次边界
- 若某轮次"独立验证"不通过（tsc 这轮过不了）→ 检查是否漏了该轮的前置文件改动
- 若判定为多轮但 plan 未提供轮次拆分 → 回退 Plan 阶段补充轮次拆分

### 第一阶段产出检查

- [ ] 已调用 `find_related_docs` 搜索相关文档
- [ ] 已阅读并理解所有相关项目文档
- [ ] 项目文档已更新（或已说明无需更新）
- [ ] add-route 执行路线图已生成（命名符合规范，Task 映射表与 tasks.md 一致）
- [ ] 文档合约一致性已确认
- [ ] **[0.6.5] Review 结论已回流至 Plan 与 Specs**——Review 中每个 P0/P1 问题在 Plan/Specs 中有对应的修正后文字 + `[回流:]` 标记
- [ ] 原子闭包判定已执行（Plan 级：确认单一业务功能；轮次级：确认文件边界独立、无跨轮修改、每轮可独立验证），轮次拆分方案已写入 add-route
- [ ] **DPS 上游文档质量闸门已通过**——调用 `check_dps({ planKeyword: "<Plan 核心关键词>" })`，DPS ≥ 85 方可进入 Step 1。未通过时回退补齐短板（Plan 粒度不足 / Review 覆盖维度缺失 / Specs Requirements 遗漏）

---

### 第二阶段：验收后架构文档复核（在 Step 8 收敛判断后执行）

> **注意**：本阶段在 Step 8 收敛判断通过后执行，不在代码实现之前执行。

代码实现完成并通过所有验证后，重新回到架构文档做最终校准：

1. **重新阅读** 第一阶段中已更新的架构文档章节
2. **逐项对照**：文档中的接口/合约/数据流与实际实现是否一致
3. **标记偏差点**：如有不一致，输出偏差报告（差异位置 + 文档描述 vs 实际实现）
4. **通知开发者决策**：AI **禁止自动修改**代码或文档来消除偏差。差异信息提交给开发者，由开发者决定是修正代码还是修正文档
5. **审计记录**：偏差标记和开发者决策结果调用 `record_dev_operation` 记录（`targetType: "DOC"`，`action: "DOC_POST_IMPLEMENTATION_REVIEW"`）

### 第二阶段产出检查

- [ ] 架构文档已重新阅读
- [ ] 文档与实现的逐项对照已完成
- [ ] 如有偏差，偏差报告已生成并提交开发者
- [ ] 开发者决策已记录（修正代码 / 修正文档 / 接受差异）

---

## 附录 A：协作文档规范（命名、格式与交互规则）

> **目标**：确保 `.qoder/specs/`、`.qoder/reviews/` 下的 spec/review/handoff 文件遵循统一的命名和格式约定，使后续 AI Session 能快速定位和恢复上下文。

> **全局文档编辑规则（A.0）**：修改 Plan、Spec、Handoff、tasks、checklist 中已有内容时，MUST 遵循增量修订格式——旧内容 `~~删除线~~` → 新内容 `[日期 修订: 原因]`，禁止直接覆盖。Review 回流点需附加 `[回流: Review P0/P1 #x 简述]` 标记。

**在编写任何代码之前，必须先确认本附录中的文件结构已就位。**

### A.1 文件命名规范

| 文档类型 | 命名规则 | 示例 | 存放位置 |
|---------|---------|------|---------|
| 开发任务（specs 三元组） | `项目名-任务名/` | `agrisynapse-user-list-pagination/` | `.qoder/specs/{YYYY}/{MM}/{DD}/` |
| review 文件 | `项目名-任务名-review-v{版本}.md` | `agrisynapse-user-list-pagination-review-v1.md` | `.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/` |
| review-implementation 文件 | `项目名-任务名-review-implementation-v{版本}.md` | `agrisynapse-user-list-pagination-review-implementation-v1.md` | `.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/` |
| review-runtime 文件 | `项目名-任务名-review-runtime-v{版本}.md` | `agrisynapse-user-list-pagination-review-runtime-v1.md` | `.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/` |
| handoff 文件 | `项目名-需求名-handoff.md` | `agrisynapse-user-list-pagination-handoff.md` | `.qoder/plans/{YYYY}/{MM}/{DD}/{任务名}/` |
| HITL 提案 | `{planName}.hitl.md` | `agrisynapse-user-list-pagination-plan-v1.hitl.md` | `.qoder/hitl/` |

**命名规则说明**：

- **项目名**：当前仓库的项目标识，本项目为 `agrisynapse`
- **任务名**：用小写中划线描述该原子事务的核心功能，如 `user-list-pagination`
- **如果需求与任务是一对一**：handoff 可以省略轮次编号，直接描述任务内容
- **handoff 只维护一个文件**：一个需求对应一个 handoff 文件，不按轮次拆分
- **review 文件按日期分层**：与 `.qoder/plans/` 和 `.qoder/specs/` 保持一致的 `{YYYY}/{MM}/{DD}/{任务名}/` 目录结构

### A.2 specs 三元组结构

标准版 Plan 的每个 spec 目录 MUST 包含三个文件，形成"需求→执行→验收"闭环：

```
.qoder/specs/{YYYY}/{MM}/{DD}/{任务名}/
  ├── spec.md       # 需求定义：Why / What Changes / Impact / Boundaries / Requirements
  ├── tasks.md      # 执行拆分：Preconditions / Forbidden / Tasks / Dependencies / Verification
  └── checklist.md  # 验收清单：编号验证项，每条可追溯到 tasks.md 的 Task
```

**spec.md 格式规范**（MUST 按以下章节顺序）：

```markdown
# {功能名称} Spec

## Why
一句话说明为什么要做这个改动。

## What Changes
列出本次会修改/新建哪些文件和内容。

## Impact
- Affected specs: 受影响的已有 spec（无则写无）
- Affected code: 受影响的代码文件列表
- 父 Plan: 链接到父计划文档
- 依赖: 上游轮次 / 模块
- 后续依赖: 下游轮次 / 模块

## Boundaries
本次只允许实现...，本次禁止实现...

## Requirements
### Requirement: {需求名}
系统 SHALL...（含 Scenario: WHEN...THEN... 格式）
```

**tasks.md 格式规范**（MUST 按以下章节顺序）：

```markdown
# Tasks: {功能名称}

## Preconditions
- [ ] 上游依赖检查项

## Forbidden
- 禁止修改...
- 禁止引入...

- [ ] Task 1: {任务名}
  - [ ] 子步骤
  - [ ] 验证标准

- [ ] Task N: ...

## Task Dependencies
- Task 2 依赖 Task 1

## Verification
- [ ] pnpm run ts:check
- [ ] pnpm run lint:eslint
- [ ] pnpm run lint:style
```

**checklist.md 格式规范**：

- 每一项是一个独立的验收条件，可追溯到 tasks.md 的具体 Task
- `[T]` 编译期验证项：逐项执行并勾选，必须附验证证据（`— 证据: tsc/vitest/grep/审计记录 等`）
- `[R]` 运行时验证项：保持 `[ ]`，自动流转到 review-runtime.md
- 勾选状态 MUST 可验证，禁止空勾选或推测通过
- 未执行的验收项 MUST 显式标注"未验证"并保留

### A.3 review 文件格式

review 文件用于在代码执行前审查 spec/tasks/checklist/handoff 的一致性和完整性。

**MUST 包含以下章节**（按顺序）：

```markdown
# 项目名-任务名-round{N}-review

## Review 元信息
- Review 对象: 列出被审查的文件路径
- Review 范围: 一句话描述
- Review 时间: ISO 日期
- 结论级别: 可接受 / 需修正后执行 / 方向错误需重做

## HITL 发现总览（一次性人类审核表）
| # | 发现 | 严重度 | 建议 | 人类决策 |
|---|------|:---:|------|:---:|
| 1 | {发现描述} | P0/P1/P2 | {修复建议} | 同意/调整 |

## 1. 总体结论
## 2. 正向评价
## 3. 问题清单
编号列表，每条含：严重程度 + 问题描述 + 修正建议。
## 4. 影响评估
修正前后对比，说明越界风险和协议破坏面。
## 5. 建议修正优先级
高 / 中 / 低 分级。
## 6. 最终建议
推荐的执行顺序和完成判定标准。
```

**Review HITL 磋商**：方案 Review（`review-template.md`）与实现 Review（`review-implementation-template.md`）MUST 走 HITL 审批——
1. 调用 `create_hitl({ planName, type: "PLAN_REVIEW" })` 创建审批提案
2. 人类审核后调用 `update_hitl({ planName, type: "PLAN_REVIEW", status: "TONGYI"|"BOHUI", _fallback: true })`
3. TONGYI 通过后，生成完整 Review 写入 `.qoder/reviews/`
4. BOHUI 驳回后，`create_hitl` 新建 round 重新发起审批

仅 `review-template.md` 和 `review-implementation-template.md` 走 HITL；`review-runtime-template.md` 不走 HITL，直接生成。

### A.4 handoff 文件格式

handoff 文件的每个轮次章节 MUST 包含以下小节：

```markdown
## <第N轮> {轮次名称}

### 你当前的位置
你是第 N 轮。上游第 X 轮完成...，本轮只做...。

### 上游已完成
列出上游轮次的交付物。

### 你的 spec 文件
链接到对应的 specs 三元组目录。

### 你要改的文件
| 文件 | 操作 | 改什么 |

### 核心设计
关键架构约束、接口定义、组件结构等。

### 关键契约细化
逐条列出不可妥协的契约约束。

### 高风险误区
列出禁止跨越的边界和常见错误方向。

### 恢复上下文审计查询（新 AI Session 首次启动必读）
- 第一步：按 targetId 搜索代码文件改动
- 第二步：搜索文档变更记录
- 第三步：按行动词搜索快速定位
- 每条 query_audit_records 调用 MUST 附带返回条数和 beforeState/afterState 说明
- 必须给出 "一键恢复" 的 keyword 搜索方式

### 验证标准
分为 "已完成验证" 和 "未执行的端到端验证" 两部分，未执行项不得勾选。

### 完成后记录 ADD-7 审计
列出本轮的 ADD-7 action 清单（含文件路径）。
```

### A.5 三种文档的交互规则

```
                    ┌─────────────────┐
                    │  spec + tasks +  │
                    │  checklist       │ ←── 被 review 引用
                    │  (三元组)         │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        review 文件     handoff 章节    代码实现
        (执行前审查)    (入口索引)      (消费 spec)
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                    checklist 逐项勾选
                             │
                             ▼
                    handoff 验证标准更新
                             │
                             ▼
                    ADD-7 审计落库 + query 回查
```

**关键规则**：

1. **handoff 是入口索引**：指向 specs 三元组，不重复 spec 的所有细节
2. **handoff 摘要与 spec 冲突时，以 spec 为准**：不允许按 handoff 的简写自行简化实现
3. **review 覆盖 handoff + specs 全部**：不是只审 spec 不审 handoff
4. **代码完成后 checklist ← 逐项勾选 → handoff 验证标准**：两者必须同步更新
5. **每轮完成后 handoff 对应章节 MUST 更新**：文件清单、契约细节、ADD-7 审计查询语句
6. **ADD-7 不只写入 record_dev_operation**：还必须用 query_audit_records 按 action/targetId/keyword 回查确认落库

---

## Step 1：功能分析与审计阶段定义

**在编写任何业务代码之前，必须先完成本步骤。**

### 1.1 分析功能的业务阶段

列出本次变更涉及的所有业务阶段，确定审计打点位置。本项目为 Vue 3 前端项目，审计打点分为三个层次：

| 层次 | 审计点 | 实现方式 |
|------|--------|---------|
| 组件层 | 生命周期对称（ADD-2）、props/emits 类型完整（ADD-3） | `onMounted`/`onUnmounted` 成对、类型定义先行 |
| 数据层 | Store action 输入/输出、API 请求/响应 | Pinia action 类型完整、请求类型定义 |
| 请求层 | 所有 POST/PUT/DELETE 请求自动记录（ADD-0.3） | **Axios 拦截器自动处理，无需手动打点** |

### 1.2 定义本次变更的审计打点清单

在 Plan 的 ADD-7 审计策略表基础上，明确每个文件的审计点：

| 文件 | 审计点 | 阶段字面量 |
|------|--------|-----------|
| `src/views/xxx/Index.vue` | 组件挂载/卸载/请求失败 | `PAGE_LOAD` / `PAGE_UNLOAD` / `REQUEST_FAIL` |

> **注意**：请求层审计由 Axios 拦截器自动完成（`src/config/axios/service.ts` 的 `API_PATH_TARGET_MAP` 注册表），**无需**在业务代码中手动调用审计函数。

### Step 1 产出检查

- [ ] 本次变更的审计打点清单已定义（组件层/数据层/请求层）
- [ ] 请求层审计确认由 Axios 拦截器自动覆盖（或需在 `API_PATH_TARGET_MAP` 新增映射）

---

## Step 2：审计基础设施确认

本项目审计基础设施已就绪，无需新建任何文件：

| 设施 | 位置 | 状态 |
|------|------|------|
| Axios 请求自动审计（ADD-0.3） | `src/config/axios/service.ts`（`API_PATH_TARGET_MAP`） | ✅ 已就绪 |
| 开发操作审计（ADD-7） | MCP `record_dev_operation`（写入 Plan 文档，无 DB） | ✅ 已就绪 |
| 审计查询（MCP-5） | MCP `query_audit_records`（读文档） | ✅ 已就绪 |
| 编译期验证 | `pnpm run ts:check` + `pnpm run lint:eslint` + `pnpm run lint:style` | ✅ 已就绪 |

### Step 2 产出检查

- [ ] 审计通道已确认可用（Axios 拦截器 + 文件化审计记录）
- [ ] 如本次变更涉及新 API 模块：已在 `API_PATH_TARGET_MAP` 注册路径映射（或确认无需）

---

## Step 3：业务逻辑实现与审计植入

**功能实现与审计点同步进行，不分离。**

### 3.0 前置守卫：add-route 存在性交叉校验（强制执行）

> **Step 3 准入条件**：add-route 文件必须已存在且通过交叉校验，否则禁止进入代码实现阶段。

在编写任何代码之前，调用 MCP 工具进行 add-route 存在性交叉校验：

```text
check_add_route_status({ planKeyword: "<Plan 核心关键词>" })
```

**四种返回状态及其处理**：

| 状态 | 含义 | 操作 |
|------|------|------|
| `normal` | 审计日志有记录 + 文件存在 + Step 全部闭环 | ✅ 通过守卫，进入 3.1 |
| `warn_step_incomplete` | 文件存在但存在未勾选的 Step 产出项 | ⚠️ 可继续，但应在 Step 3 完成后调用 `check_add_route_completeness` 自检 |
| `file_missing` | 审计有记录 + 文件丢失 | ❌ 中断执行，询问用户原因 |
| `never_generated` | 审计无记录 + 文件不存在 | ❌ 禁止进入 Step 3，强制回退至 Step 0.5 生成 add-route |

> **为什么这个守卫是必须的**：add-route 是 Plan（抽象 Task）与代码实现之间的唯一映射表。没有 add-route，AI 不知道每个 Task 对应哪些文件、植入哪些审计点、依赖拓扑如何——实现必然偏离设计。各家 IDE 可能用自己的编程流程，但一旦选择 ADD 范式，add-route 就是不可跳过的必经之路。跳过 add-route = 效果大幅下降。

**守卫产出检查**：
- [ ] `check_add_route_status` 已调用，返回 `normal` 或 `warn`
- [ ] 如返回 `never_generated`：已回退至 Step 0.5，add-route 生成完毕并重新校验通过
- [ ] 如返回 `file_missing`：已询问用户并确认处理方案

### 3.1 组件层审计植入模板（Vue 3）

```vue
<script setup lang="ts">
// ADD-2: 生命周期对称 —— onMounted 创建的资源必须在 onUnmounted 清理
import { onMounted, onUnmounted } from 'vue'

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // 阶段进入（console 可观测）
  console.info('[PAGE] mounted', { page: 'xxx' })
  timer = setInterval(/* ... */, 5000)
})

onUnmounted(() => {
  // 阶段退出 + 资源清理（ADD-2）
  if (timer) clearInterval(timer)
  console.info('[PAGE] unmounted', { page: 'xxx' })
})
</script>
```

### 3.2 数据层审计植入模板（Pinia Store + API）

```typescript
// src/api/xxx/index.ts —— 请求/响应类型完整（ADD-3/ADD-5），禁止 any
export interface XxxQuery { /* ... */ }
export interface XxxResult { /* ... */ }

export const getXxxList = (params: XxxQuery) =>
  service.get<XxxResult>('/xxx/list', { params })
```

```typescript
// src/store/modules/xxx.ts —— action 输入/输出类型明确（ADD-3）
export const useXxxStore = defineStore('xxx', () => {
  const list = ref<XxxResult[]>([])
  const loading = ref(false)

  async function fetchList(params: XxxQuery) {
    loading.value = true
    try {
      list.value = await getXxxList(params)   // 请求审计由 Axios 拦截器自动完成
      return list.value
    } catch (error) {
      // ADD-6: 失败路径等价处理 —— 错误信息 + 用户提示 + 恢复操作
      ElMessage.error('加载失败，请重试')
      throw error
    } finally {
      loading.value = false
    }
  }
  return { list, loading, fetchList }
})
```

### 3.3 失败路径等价审计（ADD-6）

catch 块必须与 try 块具有相同的信息密度：
- 必须包含：错误信息、用户提示、恢复操作
- 禁止空 catch 或仅 `console.error(error)` 的写法
- API 调用失败必须给用户可操作的反馈（重试、回退等）

### Step 3 产出检查

- [ ] **add-route 前置守卫已通过**（`check_add_route_status` 返回 `normal` 或 `warn`；若 `never_generated` 则已回退 Step 0.5 并重新校验通过）
- [ ] 组件生命周期成对（onMounted/onUnmounted 资源清理）
- [ ] props/emits 类型定义完整，无 `any`
- [ ] API 请求/响应类型定义完整
- [ ] catch 块有等价信息密度（错误信息 + 用户提示 + 恢复操作）
- [ ] 每个修改文件已调用 `record_dev_operation` 记录审计（ADD-7）

### 3.6 add-route Step 自检闭环（强制执行）

> **Step 3 代码实现全部完成后，MUST 调用 `check_add_route_completeness` 自检 add-route 的 Step 完成度，防止执行遗漏。这是 ADD v2 新增的守卫步骤。**

调用 MCP 工具扫描 add-route 的 Step 勾选状态：

```text
check_add_route_completeness({ planKeyword: "<Plan 核心关键词>" })
```

**四种返回状态及处理**：

| 状态 | 含义 | 操作 |
|------|------|------|
| `complete` | 所有 Step 产出项全部 [x] | ✅ 通过自检，进入 Step 3.5 |
| `incomplete` | 存在未勾选的 Step 产出项 | ⚠️ 逐 Step 完成未闭环项，完成后重新调用本工具 |
| `file_missing` | 未找到 add-route 文件 | ❌ 回退至 Step 0.5 生成 |
| `errors` | 文件存在但解析出错 | ❌ 检查 add-route 格式 |

**自检产出**：
- [ ] `check_add_route_completeness` 已调用，返回 `complete`
- [ ] 逐 Step 完成度报告已生成（无未勾选项）
- [ ] 如返回 `incomplete`：已完成未闭环 Step 并重新校验通过

> **为什么这个自检是必须的**：Step 3 产出检查只验证代码级别的审计植入，不验证 add-route 文档本身的 Step 执行完整度。AI 可能在完成 Step 3 代码后标记 Task 为 ✅ 但跳过 Step 3.5/4/5/8 的文档闭环。本自检扫描 add-route 文件内容，统计所有 `[ ]` vs `[x]`，确保没有任何 Step 被遗漏。

---

## Step 3.5：实现审查（ADD-10 意图与实现的语义鸿沟）

**代码实现完成后，在进入审计数据验证之前，必须先通过实现审查。**

### 3.5.1 运行 spec checklist

检查 `.qoder/specs/{task}/checklist.md` 中的所有检查项：

- `[T]` 编译期验证项：逐项执行并勾选（附验证证据）
- `[R]` 运行时验证项：保持 `[ ]`，将自动流转到 review-runtime.md

### 3.5.2 执行前端联调检查

按 `checklist-template.md` 的"联调检查"章节逐项验证：

- [T] 组件 props/emits 类型对齐（父组件传参 vs 子组件定义）
- [T] API 响应格式与类型定义匹配（`code: 0/200` 约定）
- [T] 路由 meta 完整（title/icon/roles）
- [T] Store action 调用链类型安全
- [R] 浏览器端到端验证（页面交互、请求成功/失败路径）

### 3.5.3 生成实现审查文档

按 HITL 流程执行：读取 `review-implementation-template.md` → 先写 `{name}-review-implementation.temporary.md`（只含 HITL 发现总览表，不受 guard 检查）→ 人类一次性拍板（`create_hitl`/`update_hitl`）→ 逐条展开详细分析 → 写入 `.qoder/reviews/` → 删除 temporary

### 3.5.4 生成运行时审查文档（所有 [T] 项通过后）

当所有 `[T]` 项均通过后：

1. 读取 `review-runtime-template.md`
2. 复制为 `.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/{project}-review-runtime.md`
3. 替换占位符（标题、关联文档路径）
4. §1 发现列表初始化为"尚无运行时发现"
5. §1 末尾自动插入所有 `[R]` 项的"待运行时验证"清单
6. 提示用户："review-runtime.md 已就绪，部署后异常会自动填充。"

### Step 3.5 产出检查

- [ ] spec checklist 所有 `[T]` 项已通过（附证据）
- [ ] 实现审查文档已生成（HITL 已通过）
- [ ] review-runtime.md 已生成（含 [R] 待验证清单）

---

## Step 4：审计数据验证

**运行功能，收集审计数据，验证完整性。**

### 4.1 运行功能

启动开发服务器（`pnpm dev`），触发功能执行，产生审计数据。

### 4.2 检查组件生命周期对称性

使用 MCP 工具验证：

```
check_phase_symmetry  — 验证每个组件 onMounted/onUnmounted 资源成对（ADD-2）
check_failure_path    — 验证失败路径处理完备性（ADD-6）
```

### 4.3 检查最小可观测单元（ADD-3）

验证每个组件/API/Store action 的可观测性：
- 组件：props 类型定义完整，emits 事件明确
- API 调用：请求/响应类型定义完整，错误处理完备
- Store：state 类型定义完整，action 有明确的输入/输出

### 4.4 检查三通道输出（ADD-4 前端版）

1. 浏览器 DevTools（Vue DevTools）— 实时开发调试
2. TypeScript 类型检查（`pnpm run ts:check`）— 编译时验证
3. ESLint + Stylelint（`pnpm run lint:eslint` + `pnpm run lint:style`）— 代码规范检查

### 4.5 检查失败路径（ADD-6）

模拟错误场景，验证 catch 块的信息密度与 try 块等价（错误信息 + 用户提示 + 恢复操作）。

### Step 4 产出检查

- [ ] 组件生命周期对称（Start/End 数量匹配）
- [ ] 最小可观测单元数据完整
- [ ] 三通道输出正常（DevTools / tsc / lint）
- [ ] 失败路径审计等价
- [ ] **RAHS 下游执行健康度已检查**——调用 `check_rahs({ planKeyword: "<Plan 核心关键词>" })`，RAHS ≥ 90 方可进入 Step 5。若 < 70 注意力漂移严重，强制返工 Step 3

---

## Step 5：AI 自动合规检查

**AI 助手作为审计数据的第一消费者，自动检查 ADD 原则的合规性。**

### 5.1 收集审计证据

- 调用 `query_audit_records({})` 获取最近的开发操作记录
- 运行 `pnpm run ts:check` + `pnpm run lint:eslint` + `pnpm run lint:style` 收集编译期证据

### 5.2 执行合规检查

AI 助手必须逐项检查以下合规条件，并向程序员报告结果：

**检查 1：组件生命周期对称（ADD-2）**
- 每个 `onMounted` 中创建的资源（事件监听、定时器、订阅）在 `onUnmounted` 中清理
- 异步请求有 loading/error 状态管理

**检查 2：类型完整性（ADD-3/ADD-5）**
- 组件 props/emits 类型定义完整
- API 请求/响应类型定义完整
- 无 `any` 类型

**检查 3：失败路径信息密度（ADD-6）**
- catch 块包含：错误信息、用户提示、恢复操作
- 无空 catch 或仅 console.error

**检查 4：开发操作审计完整（ADD-7）**
- 每个修改文件都有 `record_dev_operation` 记录
- `query_audit_records` 回查确认落库

### 5.3 生成合规报告

AI 助手必须生成以下格式的合规报告：

```
ADD 合规检查报告
═════════════════
功能：{feature name}
检查时间：{ISO timestamp}
审计记录条数：{N}

合规项：
  ✅ 组件生命周期对称（onMounted=5, onUnmounted=5）
  ✅ 类型完整（无 any，props/emits 全部定义）
  ✅ 失败路径等价（catch 均含错误信息+用户提示+恢复操作）
  ✅ 审计记录完整（N 条 record_dev_operation）

不合规项：
  ❌ 组件 X 在 onMounted 创建定时器但未在 onUnmounted 清理
     - 修复建议: 添加 clearInterval
```

### 5.4 AI 根据合规报告调整行为

- 如果有不合规项，AI 自动生成修复代码并提示程序员
- 如果合规报告显示功能收敛，AI 确认开发完成
- 如果发现审计数据中的异常模式，AI 主动提示

### Step 5 产出检查

- [ ] 合规检查已完成（生命周期/类型/失败路径/审计完整）
- [ ] 合规报告已生成并展示给程序员
- [ ] 不合规项已有修复建议或修复代码

---

## Step 6：从审计数据定位问题

**如果 Step 4 发现异常，从审计数据中定位根因。**

### 6.1 分析审计记录

- 调用 `query_audit_records({ keyword: "{功能关键词}" })` 查询相关审计记录
- 检查 Plan/checklist 中的验证证据

### 6.2 分析运行证据

- 浏览器 DevTools Console 的错误信息
- 组件生命周期不对称（有挂载无卸载 = 资源泄漏）
- API 请求失败路径的完整错误信息

### 6.3 从数据推断根因

审计数据的优势：
- 只有 mounted 没有 unmounted = 资源泄漏
- 某条 API 调用缺失 = 请求未发出或被拦截
- 失败路径审计缺失 = catch 块信息不足

---

## Step 7：修复并验证

### 7.1 修复问题

根据 Step 6 定位的根因进行修复。

### 7.2 重新运行验证

修复后重新执行 Step 4 的验证流程。

### 7.3 审计数据验证修复效果

对比修复前后的审计数据，确认：
- 异常消失
- 生命周期恢复对称
- 类型检查通过

---

## Step 8：收敛判断

### 收敛条件

所有以下条件满足时，功能开发收敛：

- [ ] 审计记录无 FAIL/ERROR 异常模式
- [ ] 组件生命周期完全对称
- [ ] 最小可观测单元数据完整且合理
- [ ] TypeScript 编译通过（`pnpm run ts:check`）
- [ ] ESLint/Stylelint 通过
- [ ] **checklist.md 全部项已勾选，且有可验证证据**（不得空勾选、不得"推测通过"）
- [ ] **tasks.md 全部任务已完成，且每个任务有对应的 checklist 验证记录**
- [ ] **review-runtime.md 中的 [R] 运行时验证项已全部确认**（部署后逐项验证并勾选）
- [ ] **`check_add_route_completeness` 返回 `complete`**（ADD-15：add-route 所有 Step 产出项全部 [x]，无遗漏）
- [ ] **RAHS 最终核定 ≥ 90**——调用 `check_rahs({ planKeyword: "<Plan 核心关键词>" })`，RAHS < 90 不回退修复不得收敛。`check_dps` 和 `check_rahs` 的声明交集构成了 ADD 收敛的双轨裁决

### 收敛后：记录 ROUND_CLOSED 审计（ADD-7）

> **收敛确认后、handoff 生成前，MUST 记录 ROUND_CLOSED。**

**操作**：调用 `record_dev_operation`，action 固定为 `ROUND_CLOSED`，afterState 包含本轮产出摘要。

```text
record_dev_operation({
  action: "ROUND_CLOSED",
  targetType: "PLAN",
  targetId: "{planName}::round{n}",
  reason: "轮次{n}闭合：{本轮产出摘要}"
})
```

**落库后必须回查验证**：

```text
query_audit_records({ targetId: "{planName}::round{n}" })
```

### 收敛后：执行验收闭环（ADD-12）

收敛条件全部满足后，**必须回到 Step 0 第二阶段**执行验收后架构文档复核（ADD-12 双源头漂移的必然性）：重新阅读架构文档 → 逐项对照实现 → 标记偏差点 → 通知开发者决策。这是 ADD-0.1 广义文档先行的闭合步骤。

### 收敛后：生成交接手册（handoff）

> **MUST NOT 跳过此步骤。** 收敛条件全部满足后，必须按模板生成交接手册，使后续 AI Session 能恢复上下文。
>
> **例外**：如果本 Plan 使用的是 `simple-plan-template.md`，**跳过本步骤**——Handoff 已融合在 Plan §四，无需独立文件。

1. **判断是否精简版**：检查 Plan 文件是否基于 `simple-plan-template.md` → 是则跳过，Handoff 信息已在 Plan §四 中
2. **读取对应模板**：单轮变更读 `handoff-single-round-template.md`（9 章节），多轮变更读 `handoff-multi-round-template.md`（13 子章节/轮）
3. **填满所有章节**：模板中每个 `{占位符}` 都必须替换为实际内容，不得留空。特别注意：
   - **§8 恢复上下文审计查询**：MUST 包含基于真实 `query_audit_records` 结果的逐文件审计查询语句，不得编造
   - **§9 后置确认**：逐项确认 tsc/ADD 合规/审计落库
4. **审计查询语句必须可执行**：`query_audit_records({ targetId: "..." })` 调用参数来自 `record_dev_operation` 落库的 targetId
5. **双向链接**：handoff 文件内必须包含指向对应 plan + review 的链接；review 文件内必须包含指向 handoff 的链接
6. **写入位置**：`{项目名}-{需求名}-handoff.md` → `.qoder/plans/{YYYY}/{MM}/{DD}/{任务名}/`（与 Plan 同一任务子目录）

### 未收敛

如果仍有异常，回到 Step 6 继续定位和修复。

---

## 前端审计机制参考（本项目）

本项目为 Vue 3 前端项目，审计机制与后端项目不同：

| 机制 | 说明 |
|------|------|
| 请求自动审计（ADD-0.3） | `src/config/axios/service.ts` 的 Axios 拦截器，`API_PATH_TARGET_MAP` 路径注册表，POST/PUT/DELETE 自动记录，敏感字段脱敏 |
| 开发操作审计（ADD-7） | MCP `record_dev_operation` 写入 Plan 文档审计日志（**无数据库**） |
| 审计查询（MCP-5） | MCP `query_audit_records` 读取文档审计记录 |
| 编译期验证 | `pnpm run ts:check` / `pnpm run lint:eslint` / `pnpm run lint:style` |
| 运行时验证 | 浏览器 DevTools（Vue DevTools）+ review-runtime.md |

新功能审计规范：
- 新增 API 模块：在 `API_PATH_TARGET_MAP` 加一行映射即可自动审计
- 新增组件：props/emits 类型先行，生命周期成对
- 新增 Store：state/action 类型完整
