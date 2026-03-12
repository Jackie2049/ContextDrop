# OmniContext Python SDK

用于与 OmniContext 本地服务交互的 Python 客户端库。

## 安装

```bash
pip install omnicontext
```

## 快速开始

### 初始化客户端

```python
import omnicontext

# 连接本地服务（默认 127.0.0.1:8765）
client = omnicontext.Client()

# 检查连接
if client.is_connected():
    print("✅ 已连接到 OmniContext 服务")
```

### 读取会话

```python
# 获取所有会话
sessions = client.get_sessions()

# 按来源筛选
sessions = client.get_sessions(source="platform")  # 只看 AI 助手捕获的
sessions = client.get_sessions(source="api")       # 只看 API 写入的

# 按平台筛选
kimi_sessions = client.get_sessions(platform="kimi")

# 搜索
results = client.search_sessions("用户偏好")
for r in results:
    print(f"[{r.session_title}] {len(r.matched_messages)} 条匹配消息")
```

### 写入会话

```python
# 创建新会话
session = client.write_session(
    title="Agent 对话记录",
    messages=[
        {"role": "user", "content": "帮我分析这份数据"},
        {"role": "assistant", "content": "好的，请提供数据文件..."}
    ],
    metadata={"agent": "data-analyzer", "version": "1.0"}
)

# 追加消息
client.append_messages(session.id, [
    {"role": "user", "content": "数据在这里"},
    {"role": "assistant", "content": "分析结果如下..."}
])
```

### Memory 便捷接口

```python
# 写入记忆
client.write_memory(
    content="用户偏好使用 Python 进行数据分析",
    metadata={"type": "preference", "category": "coding"}
)

# 搜索记忆
memories = client.search_memories("用户偏好", limit=5)
for m in memories:
    print(f"- {m.content}")
```

### 统计信息

```python
stats = client.get_stats()
print(f"总会话数: {stats['session_count']}")
print(f"总消息数: {stats['total_messages']}")
print(f"记忆数: {stats['memory_count']}")
```

## API 参考

### Client

| 方法 | 描述 |
|------|------|
| `get_sessions(source?, platform?, limit?, offset?)` | 获取会话列表 |
| `get_session(session_id)` | 获取单个会话 |
| `write_session(title, messages, tags?, metadata?)` | 创建会话 |
| `append_messages(session_id, messages)` | 追加消息 |
| `delete_session(session_id)` | 删除会话 |
| `search_sessions(query, limit?)` | 搜索会话 |
| `get_memories(limit?, offset?)` | 获取记忆列表 |
| `write_memory(content, metadata?)` | 写入记忆 |
| `search_memories(query, limit?)` | 搜索记忆 |
| `delete_memory(memory_id)` | 删除记忆 |
| `get_stats()` | 获取统计信息 |
| `is_connected()` | 检查连接状态 |

## 数据模型

### Session

```python
@dataclass
class Session:
    id: str
    source: "platform" | "api"
    title: str
    messages: List[Message]
    platform: Optional[str]  # 仅 source="platform" 时
    tags: List[str]
    metadata: Optional[dict]
    created_at: int
    updated_at: int
```

### Message

```python
@dataclass
class Message:
    id: str
    role: "user" | "assistant"
    content: str
    timestamp: int
```

### Memory

```python
@dataclass
class Memory:
    id: str
    content: str
    metadata: Optional[dict]
    created_at: int
```

## 错误处理

```python
from omnicontext import OmniContextError

try:
    session = client.get_session("invalid-id")
except OmniContextError as e:
    print(f"错误: {e}")
```

## 许可证

MIT
