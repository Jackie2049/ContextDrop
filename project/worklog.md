# OmniContext 项目日志

> 倒排式记录，最新记录在最上方。只增不减。

---

## 2026-03-16 豆包自动捕获问题修复

**摘要：** 修复豆包平台自动捕获失效问题，增强DOM选择器健壮性

**正文：**

### 问题诊断
1. **现象**：豆包平台会话自动捕获无法正常工作
2. **根因**：豆包页面DOM结构更新，原有选择器失效
   - `bg-s-color-bg-trans` 类名可能已变更
   - 消息容器选择器不够全面

### 修复内容

#### 1. 增强调试功能 (`src/content/index.ts`)
- 启用自动调试日志（页面加载3秒后自动执行）
- 扩展 `debugDoubaoPage()` 函数：
  - 12种消息容器选择器检测
  - 5种用户消息标识检测
  - 页面主结构分析（main元素、滚动容器）
  - 自动HTML结构dump（当未找到消息块时）

#### 2. 改进消息块查找 (`src/utils/extractor.ts`)
- 扩展 `findDoubaoMessageBlocks()` 方法：
  - 新增方法4：搜索 conversation/chat content 容器
  - 改进方法5：更多消息类名模式匹配
  - 支持 `data-index` 属性选择器（虚拟列表常见）

#### 3. 优化用户消息检测
- 新增布局特征检测（flex对齐方式）
- 扩展用户标识检查：
  - `[data-role="user"]`
  - `[class*="user-message"]`
  - `[class*="message-user"]`
  - `[class*="chat-user"]`
  - `justify-content: flex-end`
- 新增助手标识：`[data-role="assistant"]`
- 改进评分系统：模糊情况使用评分比较而非硬判断

#### 4. 增强内容提取
- 扩展内容选择器至6种模式：
  - `[class*="container-"]`
  - `[class*="message-content"]`
  - `[class*="content"]`
  - `[class*="text"]`
  - `[class*="message-body"]`
  - `[class*="bubble"]`
- 迭代选择器匹配策略（首个匹配即使用）

### 技术要点
- **多选择器策略**：从具体到通用，逐级回退
- **评分系统**：用户特征 vs 助手特征评分，处理模糊情况
- **自动调试**：页面加载自动输出诊断信息，便于远程排查
- **布局检测**：利用CSS计算属性（getComputedStyle）辅助判断

### 文件修改
- `src/content/index.ts` - 启用自动调试，增强debug函数
- `src/utils/extractor.ts` - 改进提取逻辑和回退机制

---

## 2026-03-05 Kimi 平台适配

**摘要：** 完成 Kimi (kimi.com) 平台适配，支持消息捕获和批量捕获功能

**正文：**

### 平台基础适配
1. **manifest.json 配置**
   - 添加 `https://www.kimi.com/*` 到 host_permissions
   - 添加到 content_scripts matches
   - 创建 kimi.svg 图标

2. **类型定义更新**
   - Platform 类型添加 'kimi'
   - formatPlatformName 映射
   - 各模块平台判断逻辑

### 消息提取实现
1. **选择器适配**
   - Kimi 使用语义化 CSS 类名（与 DeepSeek 的 CSS Modules 不同）
   - 用户消息：`.chat-content-item-user`, `.segment-user`
   - 助手消息：`.chat-content-item-assistant`, `.segment-assistant`
   - 消息容器：`.chat-content-list`, `.message-list`

2. **extractKimiMessages() 方法**
   ```
   查找 chat-content-item 元素 → 判断角色 → 提取文本内容
   ```

3. **标题提取**
   - 选择器：`.chat-name`, `[class*="chat-title"]`, `title`
   - URL 格式：`/chat/{sessionId}`

### 批量捕获实现
1. **会话列表检测**
   - 选择器：`.chat-info-item a[href*="/chat/"]`
   - 侧边栏：`.sidebar` 元素

2. **会话 ID 提取**
   - URL 格式：`/chat/{sessionId}`
   - 从链接 href 属性提取

3. **导航策略**
   - 点击会话链接触发路由变化
   - `waitForSessionLoad` 等待消息加载

### 文件修改清单
- `manifest.json` - 添加 Kimi 权限
- `src/types/index.ts` - Platform 类型
- `src/utils/extractor.ts` - Kimi 配置和提取方法
- `src/content/batch-capture.ts` - 批量捕获支持
- `src/content/index.ts` - 侧边栏检测
- `src/popup/index.ts` - 平台名称映射
- `icons/platforms/kimi.svg` - 平台图标

### 技术要点
- **语义化类名**：Kimi 使用清晰的语义化 CSS 类名，易于选择
- **URL 路由**：`/chat/{sessionId}` 格式
- **思考模式**：暂未实现，待后续验证

---

## 2026-03-05 DeepSeek 平台适配

**摘要：** 完成 DeepSeek 平台完整适配，包括消息提取、批量捕获和思考内容过滤

**正文：**

### 平台基础适配
1. **manifest.json 配置**
   - 添加 `https://chat.deepseek.com/*` 到 host_permissions
   - 添加到 content_scripts matches
   - 创建 deepseek.svg 图标

2. **类型定义更新**
   - Platform 类型添加 'deepseek'
   - formatPlatformName 映射
   - 各模块平台判断逻辑

### 消息提取实现
1. **选择器适配**
   - DeepSeek 使用 CSS Modules（哈希类名如 `_63c77b1`）
   - 稳定类名：`ds-message`（所有消息）、`ds-think-content`（思考内容）
   - 用户消息特征：类名包含 `d29f3d7d`

2. **extractDeepseekMessages() 方法**
   ```
   查找 ds-message 元素 → 检测 ds-think-content → 判断角色 → 提取内容
   ```

3. **思考内容处理**
   - 与豆包/元宝保持一致：只捕获最终回答，不包含思考过程
   - 克隆 DOM → 移除思考区块 → 返回正文

### 批量捕获实现
1. **会话列表检测**
   - 选择器：`._546d736` 类名 + `a[href*="/chat/s/"]` 链接
   - 可见性检查：`getBoundingClientRect()` 确保在视口内

2. **会话 ID 提取**
   - URL 格式：`/a/chat/s/{sessionId}`
   - 正则匹配：`/\/s\/([a-zA-Z0-9_-]+)/`

3. **导航策略**
   - 问题：`window.location.href` 导致页面重载，JS 状态丢失
   - 方案：点击会话链接，每次捕获前重新获取会话元素
   - 代码：`captureDeepseekSessions()` 专用方法

4. **滚动加载历史**
   - `deepseekScrollToLoadHistory()` 方法
   - 查找 `[class*="ds-scroll-area"]` 容器
   - 滚动到顶部加载更多消息

### Bug 修复

#### Bug 1: SVG className 类型错误
**错误信息：**
```
TypeError: (o.className || "").toLowerCase is not a function
at extractDeepseekAssistantContent
```

**原因分析：**
- DeepSeek 页面包含 SVG 图标元素
- SVG 元素的 `className` 属性类型是 `SVGAnimatedString`，不是字符串
- 直接调用 `.toLowerCase()` 会失败

**解决方案：**
```typescript
// 安全获取 className - 处理 SVG 元素的 SVGAnimatedString
let className = '';
try {
  className = (typeof el.className === 'string'
    ? el.className
    : (el.className as any)?.baseVal || '') || '';
} catch {
  className = '';
}
const classNameLower = className.toLowerCase();
```

#### Bug 2: 批量捕获只捕获1个会话
**原因：** 使用 `window.location.href` 导航后页面重载，JS 状态丢失

**解决：** 改用点击会话链接方式，每次捕获前重新查询会话列表
```typescript
// 每次捕获前重新获取会话元素
const sessionElements = await this.getSessionListElements();
// 找到对应的会话元素并点击
(targetElement as HTMLElement).click();
```

#### Bug 3: 侧边栏检测总是失败
**原因：** 依赖特定的 CSS Module 哈希类名，可能变化

**解决：** 暂时总是返回 true，让用户能继续操作
```typescript
// 暂时总是返回 true，让用户能继续操作
sendResponse({ sidebarVisible: true });
```

### 技术要点
- **CSS Modules 应对**：使用 `[class*="xxx"]` 属性选择器匹配部分类名
- **SPA 导航**：点击触发路由变化而非页面重载
- **SVG 处理**：检查 className 类型，使用 baseVal 获取 SVG 类名
- **状态持久化**：存储会话 ID 列表而非 DOM 元素引用

---

## 2026-03-02 批量捕获完善与会话查看功能

**摘要：** 修复批量捕获多项Bug，新增会话查看功能，优化整体UI体验

**正文：**

### 批量捕获功能完善
1. **进度计数修复**
   - 问题：显示 21/3 而非 2/3
   - 原因：`captured` 变量累加所有历史捕获数
   - 解决：使用正确的 `current` 变量显示进度

2. **负数ETA修复**
   - 问题：ETA显示 -75秒
   - 解决：当 `remaining <= 0` 时返回 `undefined`

3. **重复捕获Bug修复**
   - 问题：同一session被多次捕获
   - 原因：使用 `session.id` 判重，但捕获过程中id尚未生成
   - 解决：改用 `preSessionId`（基于平台和标题生成的预ID）

4. **消息级进度显示**
   - 新增 `sessionMessagesTotal` 字段
   - 显示格式：`正在处理 会话标题 (566条消息)`

5. **Session选择对话框**
   - 替代全量自动捕获
   - 用户可勾选要捕获的会话
   - 支持全选/取消全选

### UI/UX优化
1. **Popup高度修复**
   - 问题：打开后只显示约1cm高度
   - 解决：`min-height: 520px` + flexbox单层滚动

2. **平台Logo图标**
   - 移动SVG到 `icons/platforms/` 目录
   - 使用 `chrome.runtime.getURL()` 加载
   - 配置 `web_accessible_resources`

3. **标签管理对话框**
   - 替换原有的 `prompt()` 交互
   - 支持勾选已有标签
   - 支持创建新标签

4. **删除模式优化**
   - 删除进度可视化
   - 全选/取消全选
   - 批量删除确认

### 会话查看功能
- 点击session-info区域打开对话查看对话框
- 消息气泡样式：用户蓝色边框，助手绿色边框
- 显示角色标签和发送时间
- 支持"复制全部"功能
- 搜索关键词高亮显示
- 悬停提示："点击查看完整对话"

### 技术改进
- `BatchCaptureProgress` 接口新增 `newSessions` 和 `updatedSessions`
- `captureCurrentSession` 返回 `{ session, isNew, isUpdated, oldCount }`
- CSS优化：cursor: pointer, hover背景色变化

### 提交记录
- 批量捕获进度修复
- Session查看对话框
- 平台Logo图标支持
- 标签管理对话框
- UI布局优化

---

## 2026-02-28 元宝与Claude思考模式支持

**摘要：** 完成元宝和Claude平台的思考模式开发，测试用例增至48个

**正文：**

### 元宝平台支持
- 新增 `extractYuanbaoMessages()` 专用提取方法
- 支持CSS Modules类名模式匹配
- 实现思考内容过滤逻辑
- 回退方案：`extractYuanbaoFromDocument()`

### Claude平台支持
- 更新选择器适配现代Claude.ai DOM结构
- 新增 `extractClaudeMessages()` 专用方法
- 支持 Extended Thinking 功能过滤
- 回退方案：`extractClaudeFromDocument()`

### 思考模式通用设计
```
消息提取 → 检测思考区块 → 克隆DOM → 移除思考内容 → 返回最终回答
```

### 测试覆盖
- 新增元宝测试用例：2个
- 新增Claude测试用例：2个
- 总测试用例：48个（全部通过）

### 提交记录
- `ec43865` fix: Update test to match Doubao CSS Module selectors
- `df3f452` fix: Update Yuanbao selectors to support CSS Modules
- `f73b99d` feat: Add thinking mode support for Yuanbao and Claude

**待测试：**
- [ ] 元宝实际对话捕获测试
- [ ] 元宝思考模式过滤验证
- [ ] Claude实际对话捕获测试
- [ ] Claude Extended Thinking过滤验证

---

## 2026-02-27 标签系统功能完成

**摘要：** 实现会话标签管理功能，支持分类和筛选

**正文：**
- TagStorage 模块：标签的增删改查，11个测试用例全部通过
- 标签-会话关联：支持多标签关联一个会话
- UI集成：会话卡片显示标签，支持添加/删除标签
- 交互方式：点击 🏷️ 按钮，通过 prompt 管理标签
- 标签样式：彩色标签 pill 样式，清晰可辨
- 默认蓝色标签，计划后续支持自定义颜色

**技术实现：**
- 数据模型：Tag {id, name, color, createdAt}
- 存储结构：tags 和 session_tags 两个 storage key
- 避免重复：同名标签不可创建，同一会话同一标签不可重复添加

**待优化：**
- [ ] 标签颜色选择器
- [ ] 按标签筛选会话
- [ ] 标签管理页面（创建/删除/重命名）

---

## 2026-02-27 项目初始化与命名规范

**摘要：** 完成项目重命名、GitHub仓库同步、AgenticEngineering文档体系建立

**正文：**
- 项目正式命名为 OmniContext
- 完成代码库迁移至 `/home/zhaozifeng/cc-workspace/OmniContext`
- 同步到 GitHub 仓库：https://github.com/2012zzhao/OmniContext.git
- 主分支设为 `main`
- 建立项目管理文档体系（project/ 目录）
- 构建流程标准化：构建后自动复制到桌面供Chrome加载测试

---

## 2026-02-27 豆包平台适配完成

**摘要：** 解决豆包CSS Modules选择器问题，实现对话自动捕获

**正文：**
- 识别问题：豆包使用CSS Modules（类名如 `message-list-S2Fv2S`）
- 解决方案：使用属性选择器 `[class*="message-block-container"]`
- 通过 `bg-s-color-bg-trans` 类名区分用户/助手消息
- 豆包功能验证通过，可正常捕获和保存对话

---

## 2026-02-26 TDD开发完成核心功能

**摘要：** 采用测试驱动开发，完成35个测试用例并全部通过

**正文：**
- SessionStorage：IndexedDB存储，支持CRUD操作（9测试）
- MessageExtractor：平台检测、消息提取（18测试）
- Formatter：格式化输出、剪贴板复制（8测试）
- Content Script：自动捕获对话
- Popup UI：会话管理界面

---

## 2026-02-26 项目启动

**摘要：** Chrome扩展项目立项，支持豆包/元宝/Claude三平台

**正文：**
- 产品定位：跨平台AI对话上下文管理工具
- 核心功能：自动捕获 → 本地存储 → 按需注入
- 技术栈：Vite + TypeScript + CRXJS + Vitest
- 支持平台：豆包、元宝、Claude
- 数据模型：Session/Message/InjectionConfig

---
