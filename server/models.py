"""
OmniContext Server 数据模型
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


# 来源类型
Source = Literal["platform", "api"]

# 平台类型
Platform = Literal["doubao", "yuanbao", "claude", "deepseek", "kimi"]


class Message(BaseModel):
    """消息模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    role: Literal["user", "assistant"]
    content: str
    timestamp: int = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))


class MessageCreate(BaseModel):
    """创建消息的请求模型"""
    role: Literal["user", "assistant"]
    content: str


class Session(BaseModel):
    """会话模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    source: Source
    platform: Optional[Platform] = None
    title: str = "未命名对话"
    messages: List[Message] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    created_at: int = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))
    updated_at: int = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))

    class Config:
        json_schema_extra = {
            "example": {
                "id": "abc123def456",
                "source": "api",
                "platform": None,
                "title": "Agent 对话记录",
                "messages": [
                    {"role": "user", "content": "你好"},
                    {"role": "assistant", "content": "你好！有什么可以帮助你的？"}
                ],
                "tags": ["agent", "test"],
                "metadata": {"agent": "my-agent", "version": "1.0"},
                "created_at": 1700000000000,
                "updated_at": 1700000000000
            }
        }


class SessionCreate(BaseModel):
    """创建会话的请求模型"""
    title: str = "未命名对话"
    messages: List[MessageCreate] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None


class SessionUpdate(BaseModel):
    """更新会话的请求模型"""
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class AppendMessages(BaseModel):
    """追加消息的请求模型"""
    messages: List[MessageCreate]


class Memory(BaseModel):
    """记忆模型（简化接口）"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    content: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: int = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))


class MemoryCreate(BaseModel):
    """创建记忆的请求模型"""
    content: str
    metadata: Optional[Dict[str, Any]] = None


class SearchResult(BaseModel):
    """搜索结果模型"""
    session_id: str
    session_title: str
    matched_messages: List[Message]
    relevance: float = 1.0
