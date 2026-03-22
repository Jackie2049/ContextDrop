# ContextDrop 产品路线图

> 倒排式记录，最新记录在最上方。只增不减。

---

## 2026-03-06 Phase 4 性能优化

**摘要：** 完成核心性能优化，Rust 重构和其他扩展留待后续

**正文：**

### 已完成 ✅
- [x] SQLite 连接池优化
  - 使用线程本地存储管理连接
  - WAL 模式提升并发性能
  - PRAGMA 优化（cache_size, temp_store）
- [x] 数据库索引优化
  - 添加 message_count 列避免遍历解析 JSON
  - 添加复合索引用于常用查询
- [x] FTS5 全文搜索
  - 添加 sessions_fts 虚拟表
  - 添加 memories_fts 虚拟表
  - 搜索接口使用 FTS 替代 LIKE
- [x] API 层优化
  - 统计接口使用 message_count 列
  - 搜索结果按相关度排序

### 留待后续 📋
- [ ] Rust 重构
  - 使用 Axum 替代 FastAPI
  - 提升安全性和性能
  - 减少依赖和部署复杂度
- [ ] 向量嵌入优化
  - 支持语义检索
  - 替代关键词搜索
- [ ] 缓存层
  - 热点数据内存缓存
  - LRU 淘汰策略
- [ ] Chrome 扩展性能优化
  - 虚拟列表渲染大量会话
  - WebWorker 处理大数据

### 技术细节
**FTS5 全文搜索配置：**
```sql
CREATE VIRTUAL TABLE sessions_fts USING fts5(
    id, title, messages,
    content=''
)
```

**连接池配置：**
```python
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=NORMAL")
conn.execute("PRAGMA cache_size=10000")
conn.execute("PRAGMA temp_store=MEMORY")
```

---

## 2026-03-06 Phase 3 Python SDK 完成

**摘要：** Python SDK 开发完成，17 个测试全部通过

**正文：**

### 已完成 ✅
- [x] SDK 核心功能
  - Client 类封装 HTTP API
  - Session/Memory/Message 数据模型
  - 错误处理和连接检查
- [x] 便捷方法
  - 别名方法：search, get, list, write, delete
  - 链式调用支持
- [x] 单元测试
  - 17 个测试用例
  - 使用 mock 避免依赖服务器
- [x] 示例代码
  - examples/basic_usage.py
  - 完整的 CRUD 演示

### SDK 功能列表
| 方法 | 描述 |
|------|------|
| get_sessions() | 获取会话列表 |
| get_session(id) | 获取单个会话 |
| write_session() | 创建会话 |
| append_messages() | 追加消息 |
| delete_session() | 删除会话 |
| search_sessions() | 搜索会话 |
| write_memory() | 写入记忆 |
| search_memories() | 搜索记忆 |
| get_stats() | 获取统计 |
| is_connected() | 检查连接 |

### 文件结构
```
sdk/python/
├── contextdrop/
│   ├── __init__.py
│   ├── client.py
│   └── models.py
├── tests/
│   └── test_client.py
├── examples/
│   └── basic_usage.py
├── README.md
├── setup.py
└── pytest.ini
```

---

## 2026-03-06 Phase 2 Chrome 扩展集成完成

**摘要：** Native Messaging 集成完成，扩展数据可同步到本地服务

**正文：**

### 已完成 ✅
- [x] 类型更新
  - Session 添加 source 字段（'platform' | 'api'）
  - 区分网页捕获和 API 写入数据
- [x] Native Messaging 配置
  - native/native_host.py - Native Host 脚本
  - native/install.py - 安装脚本
  - native/contextdrop_host.json - Manifest 模板
- [x] Chrome 扩展更新
  - manifest.json 添加 nativeMessaging 权限
  - background/index.ts 添加 Native Messaging 通信
  - popup/index.ts 添加服务器状态指示器
- [x] 数据同步
  - 网页捕获自动同步到本地服务器
  - Popup 可从服务器读取数据

### 文件变更
| 文件 | 变更 |
|------|------|
| src/types/index.ts | 添加 Source 类型 |
| src/background/index.ts | 添加 Native Messaging |
| src/popup/index.ts | 服务器状态指示 |
| manifest.json | nativeMessaging 权限 |
| native/*.py | 新增目录 |

---

## 2026-03-05 Phase 2 新增：API 读写功能

**摘要：** 新增 API 读写能力，让用户程序和 Agent 也能读写 memory

**正文：**

### 功能定位
ContextDrop 成为连接 AI 助手和用户程序/Agent 的上下文管理中心：
- **网页捕获**：主流 AI 助手（豆包、元宝、Claude、DeepSeek、Kimi）
- **API 读写**：用户程序、Agent 通过 Python SDK / HTTP API 读写 memory

### 架构概览

```
┌─────────────┐    网页捕获    ┌─────────────┐    Popup 查看    ┌─────────┐
│ AI 助手网页  │ ────────────→ │             │ ────────────────→ │ 用户    │
│ (豆包/Kimi等)│    (只写)     │             │                   │ (UI)   │
└─────────────┘               │             │                   └─────────┘
                              │ ContextDrop │
┌─────────────────┐ API 读/写  │  本地服务    │
│ 用户程序/Agent  │ ←────────→ │  (SQLite)   │
│ (Python SDK)   │            └─────────────┘
└─────────────────┘
```

### 技术方案

| 组件 | 技术选型 |
|------|---------|
| 本地服务 | Python FastAPI（先）→ Rust（后） |
| 数据存储 | SQLite |
| SDK | Python 3.8+ |
| 扩展通信 | Native Messaging |

### 数据模型

```typescript
interface Session {
  id: string;
  source: 'platform' | 'api';  // 新增：来源字段
  platform?: Platform;          // 仅 source=platform 时
  title: string;
  messages: Message[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}
```

### 实现计划

#### Phase 2.1: 本地服务基础
- [ ] 创建 Python 项目结构 (`server/`)
- [ ] 实现 SQLite 存储层
- [ ] 实现 HTTP API (FastAPI)
- [ ] 实现 Native Messaging Host

#### Phase 2.2: Chrome 扩展集成
- [ ] 添加 Native Messaging 配置
- [ ] 扩展数据同步到本地服务
- [ ] Popup 可选读取本地服务数据

#### Phase 2.3: Python SDK
- [ ] 实现 SDK 核心功能 (`contextdrop` 包)
- [ ] 编写文档和示例
- [ ] 发布到 PyPI

#### Phase 2.4: 优化与扩展
- [ ] 性能优化
- [ ] Rust 重构（可选）
- [ ] 其他语言 SDK（可选）

### API 设计预览

```python
import contextdrop

client = contextdrop.Client()

# 读取
sessions = client.get_sessions(source="platform", platform="kimi")
sessions = client.search_sessions(query="用户偏好")

# 写入
client.write_session(title="Agent对话", messages=[...])

# Memory 便捷接口
client.write_memory(content="用户偏好Python", metadata={"type": "preference"})
memories = client.search_memories(query="用户偏好", limit=5)
```

---

## 2026-03-05 Phase 1 进度更新（DeepSeek平台适配）

**摘要：** 完成 DeepSeek 平台适配，包括单条捕获、批量捕获、消息提取和思考内容过滤

**正文：**

### 已完成 ✅
- [x] DeepSeek 平台基础适配
  - [x] 添加 DeepSeek 到 manifest.json host_permissions 和 content_scripts
  - [x] 创建 DeepSeek 平台图标 (deepseek.svg)
  - [x] 添加 DeepSeek 到 Platform 类型和各模块
- [x] DeepSeek 消息提取
  - [x] 实现 `extractDeepseekMessages()` 专用方法
  - [x] 使用 `[class*="ds-message"]` 选择器匹配消息元素
  - [x] 通过类名模式区分用户/助手消息（d29f3d7d 为用户标识）
  - [x] 思考内容过滤（排除 ds-think-content，与豆包/元宝一致）
  - [x] **修复 SVG 元素 className 处理**（SVGAnimatedString 不是字符串）
- [x] DeepSeek 批量捕获
  - [x] 会话列表检测（`._546d736` 类名 + `a[href*="/chat/s/"]` 链接）
  - [x] 会话 ID 提取（从 URL `/a/chat/s/{sessionId}` 提取）
  - [x] 点击导航策略（每次捕获后重新获取会话元素）
  - [x] 滚动加载历史消息
  - [x] 侧边栏可见性检测（暂时总是返回 true）
- [x] UI 优化
  - [x] 平台选择下拉框添加 DeepSeek 图标 (🔮)
  - [x] 批量捕获进度条位置修正（右下角）

### Bug 修复
1. **SVG className 类型错误**
   - 问题：`(el.className || "").toLowerCase is not a function`
   - 原因：SVG 元素的 className 是 SVGAnimatedString 对象，不是字符串
   - 解决：添加类型检查，使用 `el.className.baseVal` 获取 SVG 的类名

2. **批量捕获只捕获1个会话**
   - 原因：使用 `window.location.href` 导致页面重载，JS 状态丢失
   - 解决：改用点击会话链接方式，每次捕获前重新查询会话列表

3. **侧边栏检测失败**
   - 原因：CSS Module 哈希类名可能变化
   - 解决：暂时总是返回 true，让用户能继续操作

### 技术细节
- **CSS Modules 适配**：DeepSeek 使用哈希类名，通过 `[class*="ds-message"]` 匹配稳定部分
- **批量捕获策略**：使用点击导航而非直接修改 URL，避免页面重载
- **消息提取多层备用**：主方法 → 广泛选择器 → 终极备用（直接提取文本）

---

## 2026-03-04 Phase 1 进度更新（批量捕获稳定性优化）

**摘要：** 批量捕获互斥锁、元宝会话列表检测、思考内容提取优化

**正文：**

### 已完成 ✅
- [x] 批量捕获互斥锁机制
  - [x] 全局锁定：防止用户同时在多个平台进行批量捕获
  - [x] 自动释放：捕获完成/取消/出错/标签页关闭时自动释放锁
  - [x] 友好提示：锁定时提示用户先完成当前捕获
- [x] 元宝会话列表检测优化
  - [x] 批量捕获前检查会话列表是否可见
  - [x] 不可见时显示友好提示引导用户操作
  - [x] 提示文案优化：明确指向元宝页面操作
- [x] 思考内容提取逻辑回退
  - [x] 豆包：回退到稳定版本，过滤思考内容只保留正文
  - [x] 元宝：直接捕获全部内容，不做思考/正文区分

### 待验证 ⏳
- [ ] 元宝批量捕获完整流程测试
- [ ] 豆包思考模式过滤测试

---

## 2026-03-02 Phase 1 进度更新（批量捕获与会话查看）

**摘要：** 批量捕获功能完善，新增会话查看功能，UI体验优化

**正文：**

### 已完成 ✅
- [x] 批量捕获核心功能
  - [x] 进度计数修复（21/3 → 2/3）
  - [x] 负数ETA修复
  - [x] 重复捕获session判重（使用preSessionId）
  - [x] 消息级进度显示（如：123/566条消息）
  - [x] Session选择对话框（替代全量捕获）
- [x] UI/UX优化
  - [x] Popup高度修复（从1cm可见区域 → 完整520px）
  - [x] 平台Logo图标支持（doubao/yuanbao/claude）
  - [x] 标签管理对话框（替换prompt交互）
  - [x] 删除模式进度可视化
  - [x] 单层滚动优化（解决嵌套滚动问题）
- [x] 会话查看功能
  - [x] 点击session查看完整对话历史
  - [x] 消息气泡样式（用户蓝色/助手绿色）
  - [x] 复制全部对话按钮
  - [x] 搜索关键词高亮
  - [x] 平台图标和元数据显示

### 进行中 🔄
- [ ] 消息变化检测提示（会话更新时提醒用户）
- [ ] 新增/更新会话数统计显示

### 待验证 ⏳
- [ ] 元宝实际对话捕获测试
- [ ] Claude实际对话捕获测试

---

## 2026-03-04 Phase 2 规划：智能记忆系统

**摘要：** 实现记忆分层和语义检索，让 AI 能够真正"记住"用户的上下文

**正文：**

### 核心概念

#### 记忆分层（Memory Hierarchy）
参考人类记忆模型，将对话记忆分为多层：

```
┌─────────────────────────────────────────────────────────┐
│                    铭文记忆 (Episodic Memory)           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  原始对话记录（完整、不可变）                      │   │
│  │  - 用户说了什么                                   │   │
│  │  - AI 回复了什么                                  │   │
│  │  - 时间、平台等元数据                             │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓ 提取/压缩                    │
├─────────────────────────────────────────────────────────┤
│                  语义记忆 (Semantic Memory)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  提取的知识和模式（可检索、可推理）                 │   │
│  │  - 用户偏好："喜欢简洁的回答"                      │   │
│  │  - 事实知识："用户的项目使用 React"                │   │
│  │  - 行为模式："通常在工作日早上使用"                 │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓ 内化/参数化                  │
├─────────────────────────────────────────────────────────┤
│                  参数化记忆 (Parametric Memory)          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  嵌入模型中的隐式知识（最紧凑）                     │   │
│  │  - 向量嵌入 (Vector Embeddings)                   │   │
│  │  - 用于语义检索的索引                              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### 记忆检索（Memory Retrieval）
从关键词匹配升级为语义检索：

**当前（关键词检索）：**
```
用户搜索: "React"
匹配: 包含 "React" 字符串的对话
```

**目标（语义检索）：**
```
用户 Prompt: "我之前问过关于前端框架的事，帮我找找"
AI 分析: 理解意图 → 向量检索 → 返回相关对话
匹配: 包含 React/Vue/Angular 讨论的对话（即使没有"前端框架"字样）
```

### 功能规划

#### 2.6 智能记忆系统

**2.6.1 记忆分层存储**
```typescript
interface MemoryLayer {
  // 铭文层：原始对话（已有）
  episodic: {
    sessions: Session[];     // 完整对话记录
    immutable: true;         // 不可变
  };

  // 语义层：提取的知识
  semantic: {
    facts: Fact[];           // 提取的事实
    preferences: Preference[]; // 用户偏好
    patterns: Pattern[];     // 行为模式
  };

  // 参数化层：向量嵌入
  parametric: {
    embeddings: number[][];  // 对话向量
    index: VectorIndex;      // 向量索引
  };
}
```

**2.6.2 语义检索引擎**
```typescript
interface SemanticSearchEngine {
  // 输入：用户的自然语言 prompt
  search(prompt: string): Promise<MemoryMatch[]>;

  // 不只是关键词，而是理解意图
  // 例："上次讨论的那个 bug" → 找到相关调试对话
}

interface MemoryMatch {
  session: Session;         // 匹配的会话
  relevance: number;        // 相关度 0-1
  highlight: string;        // 高亮的相关片段
  reason: string;           // 为什么匹配（可解释性）
}
```

**2.6.3 记忆注入优化**
```typescript
interface MemoryInjection {
  // 智能选择注入内容
  selectMemories(context: {
    currentPrompt: string;    // 当前对话
    tokenLimit: number;       // 上下文限制
  }): Promise<SelectedMemories>;

  // 返回最相关的记忆，而非全部
  // 例：用户问编程问题 → 注入编程相关对话，不注入闲聊
}
```

### 技术方案

**向量数据库选型：**
| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| Chrome 内置 IndexedDB | 无需额外依赖 | 不支持向量索引 | 小数据量 |
| 本地 SQLite + faiss-wasm | 完整向量搜索 | 包体积大 | 中等数据量 |
| 浏览器 WebNN | 原生 AI 能力 | 兼容性问题 | 未来方案 |

**嵌入模型选型：**
| 模型 | 大小 | 质量 | 备注 |
|------|------|------|------|
| all-MiniLM-L6-v2 | 22MB | 中 | 轻量级 |
| bge-small-zh | 33MB | 中（中文） | 中文优化 |
| OpenAI text-embedding-3 | API | 高 | 需联网 |

### 里程碑

- [ ] **M1: 基础向量存储** - 将对话转为向量存储
- [ ] **M2: 语义搜索** - 支持自然语言检索对话
- [ ] **M3: 智能注入** - 根据当前上下文自动选择相关记忆
- [ ] **M4: 知识提取** - 从对话中提取结构化知识（语义层）
- [ ] **M5: 记忆演化** - 记忆的自动更新、遗忘、强化
- [ ] **M6: 知识图谱可视化** - 图形化展示记忆关联

### 2.6.4 知识图谱可视化

**概念：** 将用户的记忆以知识图谱形式可视化，直观展示概念之间的关联

```
示例图谱：

     ┌──────────┐
     │  React   │
     └────┬─────┘
          │
    ┌─────┴─────┐
    │           │
┌───┴───┐   ┌───┴───┐
│ Hooks │   │ Redux │
└───┬───┘   └───────┘
    │
┌───┴────────┐
│ useEffect  │
│ 问题讨论    │
└────────────┘
```

**功能点：**
```typescript
interface KnowledgeGraph {
  // 节点：知识概念
  nodes: GraphNode[];

  // 边：概念关联
  edges: GraphEdge[];

  // 交互
  interactions: {
    click: (node) => ShowRelatedSessions;  // 点击查看相关对话
    drag: (node) => Reposition;            // 拖拽调整布局
    filter: (type) => FilterByTopic;       // 按主题筛选
    timeRange: (start, end) => FilterTime; // 按时间范围筛选
  };
}

interface GraphNode {
  id: string;
  label: string;           // 概念名称
  type: 'topic' | 'entity' | 'event';
  weight: number;          // 重要性（出现频率、最近活跃度）
  sessions: string[];      // 关联的会话ID
  lastMentioned: Date;     // 最近提及时间
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;          // 关联强度
  type: 'related' | 'causal' | 'hierarchical';
}
```

**技术实现：**
- 使用 Force-Directed Graph（力导向图）布局
- 支持缩放、拖拽、点击展开
- 节点大小反映重要性
- 边的粗细反映关联强度

**UI 设计：**
- 新增"知识图谱"Tab 页
- 支持深色/浅色主题
- 节点悬停显示预览
- 点击节点展开相关对话列表

---

## 2026-02-28 Phase 1 进度更新（续）

**摘要：** 搜索功能完成，性能优化完成，导出/导入功能设计中

**正文：**

### 已完成 ✅
- [x] 实时搜索（关键词 + 标题 + 内容）
- [x] 平台筛选
- [x] 标签多选筛选
- [x] 搜索结果高亮
- [x] 消息捕获性能优化（MutationObserver + 防抖）
- [x] 一键部署脚本（deploy.sh）

### 进行中 🔄
- [ ] 导出/导入功能开发

### 待验证 ⏳
- [ ] 元宝实际对话捕获测试
- [ ] Claude实际对话捕获测试

---

## 2026-02-28 Phase 1 进度更新

**摘要：** 思考模式支持开发完成，等待实测验证

**正文：**

### 已完成 ✅
- [x] 豆包基础捕获
- [x] 豆包思考模式支持
- [x] 元宝选择器适配（CSS Modules）
- [x] 元宝思考模式开发
- [x] Claude选择器更新
- [x] Claude Extended Thinking支持
- [x] 测试用例完善（48个）
- [x] 平台折叠状态记忆
- [x] Extension Context失效处理
- [x] 标签系统

### 待验证 ⏳
- [ ] 元宝实际对话捕获测试
- [ ] 元宝思考模式过滤测试
- [ ] Claude实际对话捕获测试
- [ ] Claude Extended Thinking过滤测试

### 待开发 📋
- [ ] 捕获成功Toast通知
- [ ] 搜索功能
- [ ] 按标签筛选
- [ ] 首次使用引导

---

## 2026-02-27 完善计划总览

**摘要：** 产品未来发展方向和里程碑规划

**正文：**

### 愿景

让 ContextDrop 成为跨平台 AI 协作的标准工具，实现「一次对话，处处可用」。

### 发展阶段

```
Phase 1 (现在-1个月)    → Phase 2 (1-3个月)      → Phase 3 (3-6个月)       → Phase 4 (6个月+)
MVP稳定性               → 功能完善               → 平台扩展              → 生态建设
├─ 豆包/元宝/Claude     ├─ 智能摘要              ├─ ChatGPT             ├─ 云端同步
├─ 基础捕获/注入        ├─ 标签系统 ✅           ├─ Gemini              ├─ 团队协作
├─ 思考模式支持 ✅      ├─ 搜索功能              ├─ 文心一言            └─ API开放
└─ 本地存储             ├─ 导出增强              └─ 通义千问
```

---

## 2026-02-27 Phase 1: MVP 稳定性（当前阶段）

**摘要：** 确保核心功能稳定可用

**正文：**

### 目标
- 豆包/元宝/Claude 三大平台完美支持
- 跨平台（Windows/macOS）稳定运行
- 无重大 Bug，用户体验流畅

### 待完成任务

#### 1.1 功能开发
- [x] 豆包基础捕获 ✅
- [x] 豆包思考模式 ✅
- [x] 元宝选择器适配 ✅
- [x] 元宝思考模式 ✅
- [x] Claude选择器更新 ✅
- [x] Claude Extended Thinking ✅

#### 1.2 Bug 修复
- [x] Extension Context失效处理 ✅
- [x] 平台折叠状态重置 ✅
- [ ] macOS 兼容性验证

#### 1.3 体验优化
- [ ] 捕获成功提示（Toast 通知）
- [ ] 首次使用引导（Onboarding）
- [ ] 空状态优化（更友好的提示）

#### 1.4 性能优化
- [ ] 减少 DOM 查询频率
- [ ] 大数据量时渲染优化
- [ ] 存储压缩（长期会话）

### 验收标准
- Windows/macOS 双平台测试通过
- 连续使用 1 小时无错误
- 首次使用无需看文档即可完成注入

---

## 2026-02-27 Phase 2: 功能完善（1-3个月）

**摘要：** 提升产品完整性和易用性

**正文：**

### 2.1 智能摘要
**问题：** 长对话复制后超出 AI 上下文限制

**解决方案：**
- 自动摘要：调用 LLM API 生成对话摘要
- 长度选择：完整版 / 摘要版 / 自定义范围
- 多轮压缩：支持多次摘要保持核心信息

**技术方案：**
```typescript
interface SummaryOptions {
  mode: 'full' | 'summary' | 'lastN';
  maxLength?: number;      // 最大字符数
  useAI?: boolean;         // 是否使用 AI 摘要
  aiModel?: 'gpt-3.5' | 'local';
}
```

### 2.2 标签系统
**场景：** 用户有多类对话（工作/学习/生活）

**功能：**
- 自定义标签（颜色 + 名称）
- 多标签关联
- 按标签筛选/搜索

### 2.3 搜索功能
- 关键词搜索（标题 + 内容）
- 时间范围筛选
- 平台筛选
- 标签筛选

### 2.4 导出增强
- Markdown 格式导出
- HTML 格式（带样式）
- PDF 导出
- 批量导出（选择多个会话）
- 导出加密（端到端加密保护敏感内容）
- 部分导出（选择特定会话导出）
- 导入预览（导入前查看内容）

### 2.5 快捷操作
- 快捷键支持（Ctrl/Cmd + Shift + O 打开弹窗）
- 右键菜单（一键复制最近会话）
- 浮窗模式（页面内快速选择）

---

## 2026-02-27 Phase 3: 平台扩展（3-6个月）

**摘要：** 支持更多 AI 平台

**正文：**

### 3.1 国际平台
| 平台 | 优先级 | 难度 | 备注 |
|------|--------|------|------|
| ChatGPT | P0 | 中 | OpenAI 官方 |
| Claude.ai | P0 | 低 | 已有基础支持 |
| Gemini | P1 | 中 | Google |
| Copilot | P2 | 高 | Microsoft |

### 3.2 国内平台
| 平台 | 优先级 | 难度 | 备注 |
|------|--------|------|------|
| 文心一言 | P1 | 中 | 百度 |
| 通义千问 | P1 | 中 | 阿里 |
| Kimi | P1 | 低 | Moonshot |
| 智谱清言 | P2 | 中 | 智谱 AI |

### 3.3 技术准备
- 平台配置化（JSON 配置而非硬编码）
- 用户自定义平台（高级用户）
- 社区贡献平台适配器

---

## 2026-02-27 Phase 4: 生态建设（6个月+）

**摘要：** 构建长期价值和商业可能

**正文：**

### 4.1 云端同步（可选服务）
**场景：** 用户有多台设备

**方案：**
- 端到端加密（用户持有密钥）
- 跨设备实时同步
- 版本历史（防止误删）

**商业模式：**
- 免费：本地存储 + 1 台设备
- 付费：云端同步 + 无限设备 + 高级功能

### 4.2 团队协作
**场景：** 企业/团队共享 AI 知识库

**功能：**
- 共享会话库
- 权限管理
- 团队标注
- 知识沉淀

### 4.3 API 开放平台
```
开发者可以通过 API 访问用户的 ContextDrop 数据
（需用户授权）
```

**应用场景：**
- 第三方 AI 助手集成
- 自动化工作流（Zapier/Make）
- 企业知识管理系统

### 4.4 移动端
- Safari 扩展（iOS/macOS）
- 微信小程序（查看/分享）
- 移动端 App（管理会话）

---

## 2026-02-27 技术债务规划

**摘要：** 需要持续改进的技术问题

**正文：**

### 短期（1个月内）
- [ ] 完善 TypeScript 类型定义
- [ ] 增加更多单元测试（覆盖率 > 80%）
- [ ] E2E 测试（Playwright）

### 中期（3个月内）
- [ ] 代码重构：平台适配器模式
- [ ] 状态管理优化（考虑 Redux/MobX）
- [ ] 性能监控（错误追踪、性能指标）

### 长期（6个月内）
- [ ] Manifest V3 最佳实践全面应用
- [ ] 模块化架构支持插件系统
- [ ] 文档自动化（API 文档、用户手册）

---

## 2026-02-27 数据指标规划

**摘要：** 产品成功的衡量标准

**正文：**

### 用户指标
| 指标 | 当前 | 3个月目标 | 6个月目标 |
|------|------|-----------|-----------|
| 周活跃用户 | - | 100 | 1000 |
| 日均捕获会话 | - | 500 | 5000 |
| 注入成功率 | - | >95% | >98% |
| NPS评分 | - | >50 | >70 |

### 技术指标
| 指标 | 当前 | 目标 |
|------|------|------|
| 代码覆盖率 | ~60% | >80% |
| 严重 Bug 数 | - | <1/月 |
| 平均响应时间 | - | <100ms |

---

## 2026-02-27 商业模式探索

**摘要：** 可能的盈利方向

**正文：**

### 免费版（永远免费）
- 本地存储
- 3 个平台支持
- 基础功能

### 专业版（$5/月 或 $30/年）
- 云端同步
- 所有平台支持
- AI 智能摘要
- 优先支持

### 团队版（$15/人/月）
- 团队协作功能
- 共享知识库
- 管理后台
- API 访问

---

## 2026-02-27 社区与运营

**摘要：** 产品推广和社区建设

**正文：**

### 内容营销
- 技术博客（实现细节、踩坑记录）
- 视频教程（B站/YouTube）
- 用户案例（如何使用 ContextDrop 提升效率）

### 社区建设
- GitHub Discussions（用户交流）
- Discord/微信群（实时沟通）
- 贡献者计划（激励代码贡献）

### 增长策略
- Product Hunt 发布
- 技术社区推广（V2EX、Reddit）
- 与 AI 工具博主合作

---

## 2026-02-27 风险评估

**摘要：** 可能遇到的问题和应对

**正文：**

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| 平台改版导致失效 | 高 | 高 | 快速响应 + 社区报告 |
| Chrome 政策变更 | 中 | 高 | 关注 MV3 动态 |
| 同类竞品出现 | 中 | 中 | 快速迭代 + 差异化 |
| 用户增长缓慢 | 中 | 中 | 调整定位 + 加强运营 |
| 商业化困难 | 低 | 中 | 保持精简团队 |

---
