"""Persistent memory management using SQLite."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import sqlite_utils
from tenacity import retry, stop_after_attempt, wait_exponential

from utils.logger import logger
from utils.config import config

@dataclass
class MemoryEntry:
    """Single memory entry."""
    role: str  # 'user', 'assistant', 'system', 'tool'
    content: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    task_id: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        if self.metadata:
            data['metadata'] = json.dumps(self.metadata)
        return data
    
    @classmethod
    def from_dict(cls, data: dict) -> 'MemoryEntry':
        """Create from dictionary."""
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        if data.get('metadata') and isinstance(data['metadata'], str):
            data['metadata'] = json.loads(data['metadata'])
        return cls(**data)

class MemoryManager:
    """Manages persistent memory storage and retrieval."""
    
    def __init__(self, db_path: Optional[Path] = None):
        """Initialize memory manager with database."""
        self.db_path = db_path or config.memory_db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite_utils.Database(self.db_path)
        self._initialize_tables()
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        logger.info(f"Memory manager initialized with session {self.session_id}")
        
        # Log existing memory stats
        count = self.get_entry_count()
        if count > 0:
            logger.success(f"Loaded {count} previous interactions from memory")
    
    def _initialize_tables(self):
        """Create tables if they don't exist."""
        # Main memory table
        self.db["memory"].create({
            "id": int,
            "role": str,
            "content": str,
            "timestamp": str,
            "metadata": str,
            "session_id": str,
            "task_id": str
        }, pk="id", if_not_exists=True)
        
        # Create indexes for faster queries
        self.db["memory"].create_index(["timestamp"], if_not_exists=True)
        self.db["memory"].create_index(["session_id"], if_not_exists=True)
        self.db["memory"].create_index(["task_id"], if_not_exists=True)
        
        # Task summary table
        self.db["task_summaries"].create({
            "task_id": str,
            "summary": str,
            "created_at": str,
            "completed_at": str,
            "status": str,
            "result": str
        }, pk="task_id", if_not_exists=True)
        
        # Enable full-text search
        self.db["memory"].enable_fts(["content"], create_triggers=True, replace=True)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    def add_entry(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None,
                  task_id: Optional[str] = None) -> int:
        """Add a new memory entry."""
        entry = MemoryEntry(
            role=role,
            content=content,
            timestamp=datetime.now(),
            metadata=metadata,
            session_id=self.session_id,
            task_id=task_id
        )
        
        try:
            result = self.db["memory"].insert(entry.to_dict())
            logger.debug(f"Added memory entry: {role} - {len(content)} chars")
            
            # Cleanup old entries if exceeding limit
            self._cleanup_old_entries()
            
            return result.last_pk
        except Exception as e:
            logger.error("Failed to add memory entry", exception=e)
            raise
    
    def get_recent_entries(self, limit: int = 50, session_only: bool = False) -> List[MemoryEntry]:
        """Get recent memory entries."""
        query = self.db["memory"].rows_where(
            where="session_id = ?" if session_only else None,
            where_args=[self.session_id] if session_only else None,
            order_by="-timestamp",
            limit=limit
        )
        
        entries = [MemoryEntry.from_dict(dict(row)) for row in query]
        entries.reverse()  # Return in chronological order
        return entries
    
    def search_history(self, query: str, limit: int = 20) -> List[MemoryEntry]:
        """Search memory using full-text search."""
        try:
            results = self.db["memory"].search(query, limit=limit)
            return [MemoryEntry.from_dict(dict(row)) for row in results]
        except Exception as e:
            logger.error(f"Search failed for query '{query}'", exception=e)
            return []
    
    def get_context_window(self, max_tokens: int = 4000) -> List[MemoryEntry]:
        """Get recent entries that fit within token limit."""
        entries = self.get_recent_entries(limit=config.memory_context_window)
        
        # Simple token estimation (4 chars ≈ 1 token)
        total_tokens = 0
        context = []
        
        for entry in reversed(entries):
            entry_tokens = len(entry.content) // 4
            if total_tokens + entry_tokens > max_tokens:
                break
            context.insert(0, entry)
            total_tokens += entry_tokens
        
        return context
    
    def save_task_summary(self, task_id: str, summary: str, status: str = "completed",
                         result: Optional[str] = None):
        """Save a task summary for future reference."""
        self.db["task_summaries"].insert({
            "task_id": task_id,
            "summary": summary,
            "created_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat() if status == "completed" else None,
            "status": status,
            "result": result
        }, replace=True)
        logger.info(f"Saved task summary: {task_id}")
    
    def get_task_summaries(self, limit: int = 10) -> List[Dict]:
        """Get recent task summaries."""
        return list(self.db["task_summaries"].rows_where(
            order_by="-created_at",
            limit=limit
        ))
    
    def get_entry_count(self) -> int:
        """Get total number of memory entries."""
        return self.db["memory"].count
    
    def _cleanup_old_entries(self):
        """Remove old entries if exceeding max limit."""
        count = self.get_entry_count()
        if count > config.max_memory_entries:
            # Keep most recent entries
            cutoff_id = count - config.max_memory_entries
            self.db.execute(f"DELETE FROM memory WHERE id <= ?", [cutoff_id])
            logger.info(f"Cleaned up {cutoff_id} old memory entries")
    
    def clear_session(self):
        """Clear current session memory."""
        self.db.execute("DELETE FROM memory WHERE session_id = ?", [self.session_id])
        logger.info(f"Cleared session {self.session_id}")
    
    def export_session(self, output_path: Path) -> bool:
        """Export current session to JSON file."""
        try:
            entries = self.get_recent_entries(session_only=True)
            data = {
                "session_id": self.session_id,
                "entries": [entry.to_dict() for entry in entries]
            }
            
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)
            
            logger.success(f"Exported session to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to export session", exception=e)
            return False