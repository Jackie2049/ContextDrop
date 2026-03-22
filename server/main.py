"""
ContextDrop Server - 本地 HTTP 服务

提供 REST API 供 SDK 和其他程序访问
"""
from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from uvicorn import Config, Server

from models import (
    Session, SessionCreate, SessionUpdate, AppendMessages,
    Memory, MemoryCreate, SearchResult, MessageCreate, Message
)
from storage import storage

# 创建 FastAPI 应用
app = FastAPI(
    title="ContextDrop Server",
    description="本地 Memory 存储服务，支持 API 读写",
    version="0.1.0"
)

# 允许跨域（本地开发）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Session API ============

@app.get("/api/sessions")
async def list_sessions(
    source: Optional[str] = Query(None, description="来源筛选: platform 或 api"),
    platform: Optional[str] = Query(None, description="平台筛选: doubao, yuanbao 等"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """获取会话列表"""
    sessions = storage.get_sessions(source=source, platform=platform, limit=limit, offset=offset)
    return {
        "total": len(sessions),
        "sessions": [s.model_dump() for s in sessions]
    }


# 注意：搜索路由必须在 {session_id} 之前定义
@app.get("/api/sessions/search")
async def search_sessions(
    q: str = Query(..., description="搜索关键词"),
    limit: int = Query(10, ge=1, le=100)
):
    """搜索会话"""
    results = storage.search_sessions(q, limit)
    return {
        "query": q,
        "total": len(results),
        "results": results
    }


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """获取单个会话"""
    session = storage.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@app.post("/api/sessions")
async def create_session(data: SessionCreate):
    """创建会话"""
    now = int(datetime.now().timestamp() * 1000)

    # 转换消息
    messages = [
        Message(
            role=m.role,
            content=m.content
        ) for m in data.messages
    ]

    session = Session(
        id=str(uuid.uuid4())[:12],
        source="api",  # API 创建的会话
        platform=None,
        title=data.title,
        messages=messages,
        tags=data.tags,
        metadata=data.metadata,
        created_at=now,
        updated_at=now
    )

    created = storage.create_session(session)
    return created.model_dump()


@app.patch("/api/sessions/{session_id}")
async def update_session(session_id: str, data: SessionUpdate):
    """更新会话"""
    updates = data.model_dump(exclude_unset=True)
    session = storage.update_session(session_id, updates)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@app.post("/api/sessions/{session_id}/messages")
async def append_messages(session_id: str, data: AppendMessages):
    """追加消息到会话"""
    messages = [
        Message(
            role=m.role,
            content=m.content
        ) for m in data.messages
    ]

    session = storage.append_messages(session_id, messages)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    success = storage.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session deleted"}


# ============ Memory API (简化接口) ============

@app.get("/api/memories")
async def list_memories(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """获取记忆列表"""
    memories = storage.get_memories(limit=limit, offset=offset)
    return {
        "total": len(memories),
        "memories": [m.model_dump() for m in memories]
    }


@app.post("/api/memories")
async def create_memory(data: MemoryCreate):
    """写入记忆"""
    memory = Memory(
        content=data.content,
        metadata=data.metadata
    )
    created = storage.create_memory(memory)
    return created.model_dump()


@app.get("/api/memories/search")
async def search_memories(
    q: str = Query(..., description="搜索关键词"),
    limit: int = Query(10, ge=1, le=100)
):
    """搜索记忆"""
    memories = storage.search_memories(q, limit)
    return {
        "query": q,
        "total": len(memories),
        "memories": [m.model_dump() for m in memories]
    }


@app.delete("/api/memories/{memory_id}")
async def delete_memory(memory_id: str):
    """删除记忆"""
    success = storage.delete_memory(memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"success": True, "message": "Memory deleted"}


# ============ Stats API ============

@app.get("/api/stats")
async def get_stats():
    """获取统计信息"""
    return storage.get_stats()


# ============ Health Check ============

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "service": "contextdrop-server"}


# ============ Main ============

def run_server(host: str = "127.0.0.1", port: int = 8765):
    """启动服务器"""
    config = Config(app=app, host=host, port=port, log_level="info")
    server = Server(config)
    server.run()


if __name__ == "__main__":
    print(f"🚀 ContextDrop Server starting at http://127.0.0.1:8765")
    run_server()
