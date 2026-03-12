"""
数据模型
"""
from typing import Optional, List, Dict, Any, Literal
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Message:
    """消息"""
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: int

    @classmethod
    def from_dict(cls, data: dict) -> "Message":
        return cls(
            id=data["id"],
            role=data["role"],
            content=data["content"],
            timestamp=data["timestamp"]
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp
        }


@dataclass
class Session:
    """会话"""
    id: str
    source: Literal["platform", "api"]
    title: str
    messages: List[Message]
    platform: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    created_at: int = 0
    updated_at: int = 0

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        messages = [Message.from_dict(m) for m in data.get("messages", [])]
        return cls(
            id=data["id"],
            source=data["source"],
            title=data["title"],
            messages=messages,
            platform=data.get("platform"),
            tags=data.get("tags", []),
            metadata=data.get("metadata"),
            created_at=data.get("created_at", 0),
            updated_at=data.get("updated_at", 0)
        )


@dataclass
class Memory:
    """记忆"""
    id: str
    content: str
    created_at: int
    metadata: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Memory":
        return cls(
            id=data["id"],
            content=data["content"],
            created_at=data.get("created_at", 0),
            metadata=data.get("metadata")
        )


@dataclass
class SearchResult:
    """搜索结果"""
    session_id: str
    session_title: str
    matched_messages: List[Message]
    relevance: float

    @classmethod
    def from_dict(cls, data: dict) -> "SearchResult":
        messages = [Message.from_dict(m) for m in data.get("matched_messages", [])]
        return cls(
            session_id=data["session_id"],
            session_title=data["session_title"],
            matched_messages=messages,
            relevance=data.get("relevance", 1.0)
        )
