# {标题}

## Review 元信息

- **Review 对象**: {被评审的代码变更 / 跨系统集成}
- **关联方案 review**: {前置方案 review 文档路径}
- **Review 时间**: {YYYY-MM-DD}
- **Review 类型**: 实现 review（ADD-10）
- **前置阅读**: {关联的 plan / spec / checklist}

---

## 1. 接口格式契约

列出所有前后端 API 交互，逐对验证请求/响应格式：

| API 端点 | 前端调用文件 | 期望类型 | 后端返回 | 实际类型 | 匹配? |
|---------|------------|---------|---------|---------|:---:|
| {端点1} | {前端文件:行} | {格式} | {后端文件:行} | {格式} | ✅/❌ |

- [ ] 所有字段名和嵌套结构一致
- [ ] 响应 Content-Type 匹配前端解析器（JSON vs FormData vs Blob）
- [ ] 分页参数格式对齐（pageNum/pageSize vs page/size）

---

## 2. 框架版本兼容性

- [ ] `cat package.json | jq .dependencies.vue` 确认主版本号
- [ ] Element Plus 版本与组件 API 兼容
- [ ] Vite 构建配置无 breaking changes

---

## 3. 组件接口约束

- [ ] Props 类型定义与父组件传值一致
- [ ] Emits 事件名与父组件监听一致
- [ ] 组件 ref 暴露的方法与调用方一致

---

## 4. 环境变量加载链

- [ ] 列出 `.env.*` → 每个 `VITE_` 变量的实际值
- [ ] 多套环境（dev/test/prod）指向正确后端地址
- [ ] `import.meta.env.VITE_*` 在构建时正确注入

---

## 5. 路由与权限

- [ ] 新增/修改路由的 `meta.roles` 与后端权限匹配
- [ ] 路由守卫（`permission.ts`）覆盖新路由
- [ ] 动态路由加载逻辑正确

---

## 6. 浏览器兼容性验证

- [ ] 关键功能在 Chrome/Firefox/Safari 中测试
- [ ] CSS 兼容（UnoCSS 生成的样式无兼容性问题）

---

## 7. 关联 Checklist

- 本 review 的检查项与 `{checklist 文档路径}` 的"跨项目联调检查"章节一一对应
- [ ] checklist 全部通过后，流转至运行时验证阶段
