---
trigger: always_on
alwaysApply: true
---
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:add-workflow-entry -->
# ADD 工作流入口

## 空白对话开局

每次新对话开始时，必须先调用 `get_project_context({ scope: "add-state" })` 获取 ADD 工作流状态快照，然后根据返回的「待执行 ADD 操作」清单确定下一步。

## 开发执行

所有功能开发、Bug 修复、系统修改必须走 ADD 范式 9 阶段（Step 0-8）。使用 `add-paradigm` SKILL 进入工作流。DO NOT skip sub-steps.

## 关键 MCP 工具

| 工具 | 用途 | 触发时机 |
|------|------|---------|
| `get_project_context({ scope: "add-state" })` | ADD 工作流状态 + 待执行清单 | 空白对话开局 |
| `check_dps` | DPS 门禁（四维各 25%） | Step 0 末尾 |
| `check_rahs` | RAHS 门禁（执行健康度） | Step 4/8 |
| `check_add_route_status` | add-route 存在性校验 | Step 3 前 |

## 文档回流

0.6.5 卡位：Plan Review 的 P0/P1 问题必须在进入 Step 1 前回流至 Plan 体。未回流 = Review 白做。
<!-- END:add-workflow-entry -->
