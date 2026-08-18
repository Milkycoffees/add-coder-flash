# Checklist

## Phase 1: {阶段名称}

- [ ] 检查项1
- [ ] 检查项2

## Phase 2: {阶段名称}

- [ ] 检查项1
- [ ] 检查项2

## ADD 规则合规检查

- [ ] ADD-1 可观测性优先
- [ ] ADD-2 组件生命周期对称
- [ ] ADD-4 三通道输出（DevTools + TypeScript + Lint）
- [ ] Plan/Spec 一致性（代码实现与文档定义一致）
- [ ] Plan/Spec 修订记录（如有修订已记录审计日志）

## 跨项目联调检查（涉及前后端联调时必做）

> `[T]` = 编译期可验证（AI 可在代码阶段直接检查）
> `[R]` = 运行时验证（需部署运行后才能确认，自动流转到 review-runtime.md）

### 格式契约

- [T] 所有跨系统 API：发送方参数类型 = 接收方解析类型，字段名一致
- [T] 响应 Content-Type 匹配前端解析器（JSON vs FormData vs Blob）

### 框架版本

- [T] 确认 `package.json` 主版本号，查 breaking changes
- [T] Element Plus 版本与组件 API 兼容

### 组件接口

- [T] Props 类型定义与父组件传值一致
- [T] Emits 事件名与父组件监听一致
- [T] `userId` 等字段是真实存在的 ID，不是硬编码字符串

### 环境变量

- [T] `.env.*` → 每个 `VITE_` 变量的值逐项验证
- [T] 多套环境（dev/test/prod）指向正确后端地址
- [T] `import.meta.env.VITE_*` 在构建时正确注入

### 路由与权限

- [T] 新增/修改路由的 `meta.roles` 与后端权限匹配
- [T] 路由守卫（`permission.ts`）覆盖新路由

### 浏览器兼容性

- [R] 关键功能在 Chrome/Firefox/Safari 中测试
- [R] CSS 兼容（UnoCSS 生成的样式无兼容性问题）

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 编译期检查项均为 `[x]` 时（`[R]` 项可保持 `[ ]`），AI 必须执行：
>
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `.qoder/reviews/{YYYY}/{MM}/{DD}/{任务名}/{project}-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后 `pnpm run dev` 启动时会扫描此文件。"
