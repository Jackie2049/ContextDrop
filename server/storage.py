"""
ContextDrop Server 存储层 - SQLite

性能优化：
- 使用连接池减少连接开销
- 添加 FTS 全文搜索索引
- message_count 列避免 JSON 解析统计
- 预编译语句缓存
"""
import sqlite3
import json
import os
import threading
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import contextmanager
from queue import Queue

from models import Session, Message, Memory


class ConnectionPool:
    """简单的连接池实现"""

    def __init__(self, db_path: str, pool_size: int = 5):
        self.db_path = db_path
        self.pool_size = pool_size
        self._local = threading.local()
        self._lock = threading.Lock()

    def get_connection(self) -> sqlite3.Connection:
        """获取线程本地连接"""
        if not hasattr(self._local, 'connection') or self._local.connection is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            # 性能优化设置
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA cache_size=10000")
            conn.execute("PRAGMA temp_store=MEMORY")
            self._local.connection = conn
        return self._local.connection

    def close_all(self):
        """关闭所有连接"""
        if hasattr(self._local, 'connection') and self._local.connection:
            self._local.connection.close()
            self._local.connection = None


class Storage:
    """SQLite 存储层 - 性能优化版"""

    def __init__(self, db_path: str = None):
        if db_path is None:
            # 默认存储在用户目录
            home = os.path.expanduser("~")
            data_dir = os.path.join(home, ".contextdrop")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "data.db")

        self.db_path = db_path
        self._pool = ConnectionPool(db_path)
        self._init_db()

    @contextmanager
    def _get_connection(self):
        """获取数据库连接（从连接池）"""
        conn = self._pool.get_connection()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise

    def _init_db(self):
        """初始化数据库表"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 会话表（添加 message_count 列用于快速统计）
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    platform TEXT,
                    title TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    message_count INTEGER DEFAULT 0,
                    tags TEXT,
                    metadata TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """)

            # 记忆表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at INTEGER NOT NULL
                )
            """)

            # FTS 全文搜索虚拟表（会话内容）
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts
                USING fts5(id, title, content, content='')
            """)

            # FTS 全文搜索虚拟表（记忆内容）
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
                USING fts5(id, content, content='')
            """)

            # 索引
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_source
                ON sessions(source)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_platform
                ON sessions(platform)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
                ON sessions(updated_at DESC)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_created_at
                ON sessions(created_at DESC)
            """)

            conn.commit()

    def _update_fts(self, conn, session_id: str, title: str, messages: List[Message]):
        """更新 FTS 索引"""
        # 提取所有消息内容用于搜索
        content = " ".join([m.content for m in messages])
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO sessions_fts (id, title, content)
            VALUES (?, ?, ?)
        """, (session_id, title, content))

    def _update_memory_fts(self, conn, memory_id: str, content: str):
        """更新记忆 FTS 索引"""
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO memories_fts (id, content)
            VALUES (?, ?)
        """, (memory_id, content))

    # ============ Session CRUD ============

    def create_session(self, session: Session) -> Session:
        """创建会话"""
        messages_json = json.dumps([m.model_dump() for m in session.messages])
        message_count = len(session.messages)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sessions (id, source, platform, title, messages, message_count, tags, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session.id,
                session.source,
                session.platform,
                session.title,
                messages_json,
                message_count,
                json.dumps(session.tags),
                json.dumps(session.metadata) if session.metadata else None,
                session.created_at,
                session.updated_at
            ))

            # 更新 FTS 索引
            self._update_fts(conn, session.id, session.title, session.messages)

            conn.commit()
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """获取单个会话"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_session(row)
        return None

    def get_sessions(
        self,
        source: Optional[str] = None,
        platform: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Session]:
        """获取会话列表"""
        query = "SELECT * FROM sessions WHERE 1=1"
        params = []

        if source:
            query += " AND source = ?"
            params.append(source)
        if platform:
            query += " AND platform = ?"
            params.append(platform)

        query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [self._row_to_session(row) for row in rows]

    def update_session(self, session_id: str, updates: Dict[str, Any]) -> Optional[Session]:
        """更新会话"""
        session = self.get_session(session_id)
        if not session:
            return None

        update_fields = []
        update_values = []

        if "title" in updates:
            update_fields.append("title = ?")
            update_values.append(updates["title"])
        if "tags" in updates:
            update_fields.append("tags = ?")
            update_values.append(json.dumps(updates["tags"]))
        if "metadata" in updates:
            update_fields.append("metadata = ?")
            update_values.append(json.dumps(updates["metadata"]))

        update_fields.append("updated_at = ?")
        update_values.append(int(datetime.now().timestamp() * 1000))

        update_values.append(session_id)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE sessions SET {', '.join(update_fields)} WHERE id = ?",
                update_values
            )

            # 如果标题更新，同步更新 FTS
            if "title" in updates:
                self._update_fts(conn, session_id, updates["title"], session.messages)

            conn.commit()

        return self.get_session(session_id)

    def append_messages(self, session_id: str, messages: List[Message]) -> Optional[Session]:
        """追加消息到会话"""
        session = self.get_session(session_id)
        if not session:
            return None

        all_messages = list(session.messages) + messages
        messages_json = json.dumps([m.model_dump() for m in all_messages])
        message_count = len(all_messages)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE sessions
                SET messages = ?, message_count = ?, updated_at = ?
                WHERE id = ?
            """, (
                messages_json,
                message_count,
                int(datetime.now().timestamp() * 1000),
                session_id
            ))

            # 更新 FTS 索引
            self._update_fts(conn, session_id, session.title, all_messages)

            conn.commit()

        return self.get_session(session_id)

    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            # 同时删除 FTS 索引
            cursor.execute("DELETE FROM sessions_fts WHERE id = ?", (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    def search_sessions(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """搜索会话 - 使用 FTS 全文搜索"""
        results = []

        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 使用 FTS5 进行全文搜索
            try:
                cursor.execute("""
                    SELECT s.id, s.title, s.messages, s.source, s.platform
                    FROM sessions s
                    JOIN sessions_fts fts ON s.id = fts.id
                    WHERE sessions_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (query, limit))
            except sqlite3.OperationalError:
                # FTS 搜索失败时回退到 LIKE 搜索
                search_pattern = f"%{query}%"
                cursor.execute("""
                    SELECT id, title, messages, source, platform
                    FROM sessions
                    WHERE title LIKE ? OR messages LIKE ?
                    ORDER BY updated_at DESC
                    LIMIT ?
                """, (search_pattern, search_pattern, limit))

            for row in cursor.fetchall():
                try:
                    messages = json.loads(row["messages"])
                    matched = [
                        Message(**m) for m in messages
                        if query.lower() in m.get("content", "").lower()
                    ]

                    results.append({
                        "session_id": row["id"],
                        "session_title": row["title"],
                        "matched_messages": matched,
                        "relevance": 1.0 if matched else 0.5
                    })
                except (json.JSONDecodeError, KeyError):
                    continue

        return results

    def _row_to_session(self, row) -> Session:
        """将数据库行转换为 Session 对象"""
        messages_data = json.loads(row["messages"])
        messages = [Message(**m) for m in messages_data]

        tags = json.loads(row["tags"]) if row["tags"] else []
        metadata = json.loads(row["metadata"]) if row["metadata"] else None

        return Session(
            id=row["id"],
            source=row["source"],
            platform=row["platform"],
            title=row["title"],
            messages=messages,
            tags=tags,
            metadata=metadata,
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    # ============ Memory CRUD ============

    def create_memory(self, memory: Memory) -> Memory:
        """创建记忆"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO memories (id, content, metadata, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                memory.id,
                memory.content,
                json.dumps(memory.metadata) if memory.metadata else None,
                memory.created_at
            ))

            # 更新 FTS 索引
            self._update_memory_fts(conn, memory.id, memory.content)

            conn.commit()
        return memory

    def get_memories(self, limit: int = 100, offset: int = 0) -> List[Memory]:
        """获取记忆列表"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM memories ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            )
            rows = cursor.fetchall()
            return [self._row_to_memory(row) for row in rows]

    def search_memories(self, query: str, limit: int = 10) -> List[Memory]:
        """搜索记忆 - 使用 FTS 全文搜索"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            try:
                # 使用 FTS5 进行全文搜索
                cursor.execute("""
                    SELECT m.*
                    FROM memories m
                    JOIN memories_fts fts ON m.id = fts.id
                    WHERE memories_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (query, limit))
            except sqlite3.OperationalError:
                # FTS 搜索失败时回退到 LIKE 搜索
                search_pattern = f"%{query}%"
                cursor.execute("""
                    SELECT * FROM memories
                    WHERE content LIKE ?
                    ORDER BY created_at DESC
                    LIMIT ?
                """, (search_pattern, limit))

            rows = cursor.fetchall()
            return [self._row_to_memory(row) for row in rows]

    def delete_memory(self, memory_id: str) -> bool:
        """删除记忆"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            cursor.execute("DELETE FROM memories_fts WHERE id = ?", (memory_id,))
            conn.commit()
            return cursor.rowcount > 0

    def _row_to_memory(self, row) -> Memory:
        """将数据库行转换为 Memory 对象"""
        metadata = json.loads(row["metadata"]) if row["metadata"] else None
        return Memory(
            id=row["id"],
            content=row["content"],
            metadata=metadata,
            created_at=row["created_at"]
        )

    # ============ 统计 ============

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息 - 使用 message_count 列优化"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 会话统计（单次查询）
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN source = 'platform' THEN 1 ELSE 0 END) as platform_count,
                    SUM(CASE WHEN source = 'api' THEN 1 ELSE 0 END) as api_count,
                    COALESCE(SUM(message_count), 0) as total_messages
                FROM sessions
            """)
            row = cursor.fetchone()
            session_count = row["total"]
            platform_count = row["platform_count"] or 0
            api_count = row["api_count"] or 0
            total_messages = row["total_messages"] or 0

            # 记忆统计
            cursor.execute("SELECT COUNT(*) FROM memories")
            memory_count = cursor.fetchone()[0]

            return {
                "session_count": session_count,
                "platform_sessions": platform_count,
                "api_sessions": api_count,
                "total_messages": total_messages,
                "memory_count": memory_count
            }


# 全局存储实例
storage = Storage()
