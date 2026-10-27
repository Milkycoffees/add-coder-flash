# {需求域名}-{核心内容}-plan-v{版本号}

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Phase 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。
>
> **存放位置**：`.kimi-code/plans/{YYYY}/{MM}/{DD}/{功能名}/`（按启动时间的年月日分层，与 `.kimi-code/Interface/` 同模式；同任务 plan/route/handoff 归入同一子目录）

## PLAN 元信息

- **Plan 名称**: {英文名}-{序号}
- **启动时间**: {YYYY-MM-DD HH:mm:ss}
- **主导 AI**: {AI 助手标识}
- **关联文档**:
  - ADD Route: `.kimi-code/plans/{YYYY}/{MM}/{DD}/{功能名}/add-route-v{版本}.md`
  - Handoff: `.kimi-code/plans/{YYYY}/{MM}/{DD}/{功能名}/handoff-v{版本}.md`
  - Review: `.kimi-code/reviews/{YYYY}/{MM}/{DD}/{功能名}/review-v{版本}.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| path/to/file.vue | COMPONENT | COMPONENT_CREATED | 描述改前状态 | 描述改后状态 | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

### 1.2 目标

---

## 二、方案选型（如有多个候选方案）

### 2.1 候选方案对比

| 方案 | 因素1 | 因素2 | 因素3 | 结论 |
|------|-------|-------|-------|------|
| A: xxx | | | | |
| B: xxx | | | | |

### 2.2 选型理由

---

## 三、架构设计

---

## 四、实施步骤 + 依赖图

```
Task 1 ──┐
          │ 可并行
Task 2 ──┘
          │
          ▼
Task 3 ──┐
Task 4 ──┤ 可并行
Task 5 ──┘
          │
          ▼
Task 6 (编译/测试)
```

### Step 0: 文档先行

### Step N: ...

---

## 五、验收标准

- [ ] TypeScript 类型检查通过（`pnpm run ts:check`）
- [ ] ESLint 检查通过（`pnpm run lint:eslint`）
- [ ] Stylelint 检查通过（`pnpm run lint:style`）
- [ ] 功能在浏览器中正常展示

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.kimi-code/plans/{YYYY}/{MM}/{DD}/{功能名}/...` |
| Handoff | `.kimi-code/plans/{YYYY}/{MM}/{DD}/{功能名}/...` |
| Review | `.kimi-code/reviews/...` |
| Spec | `.kimi-code/specs/{name}/spec.md` |
| Tasks | `.kimi-code/specs/{name}/tasks.md` |
| Checklist | `.kimi-code/specs/{name}/checklist.md` |
