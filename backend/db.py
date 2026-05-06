import os
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
import threading
from typing import Optional

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship


Base = declarative_base()

# --- Flexible DB configuration ---
# By default DB persistence is enabled locally. When deployed on Vercel
# we disable persistence unless explicitly enabled via DB_ENABLED.
_is_vercel = os.getenv("VERCEL") is not None
_db_enabled_env = os.getenv("DB_ENABLED")
if _db_enabled_env is None:
    DB_ENABLED = not _is_vercel
else:
    DB_ENABLED = _db_enabled_env.lower() in ("1", "true", "yes", "on")

DATABASE_URL = os.getenv("DATABASE_URL")

# If DB persistence is enabled, create SQLAlchemy engine. Otherwise use
# an in-memory fallback so the application continues to work but changes
# won't be persisted across restarts (useful for serverless deploys).
engine = None
SessionLocal = None

if DB_ENABLED:
    if not DATABASE_URL:
        # fallback to local sqlite for development when DATABASE_URL not provided
        base_dir = Path(__file__).resolve().parent
        DATABASE_URL = f"sqlite:///{base_dir / 'chat_history.db'}"

    connect_args = {}
    if DATABASE_URL.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
else:
    # In-memory fallback structures
    _mem_lock = threading.Lock()
    _mem_conv_next_id = 1
    _mem_msg_next_id = 1
    # map session_id -> conv, and id -> conv
    _mem_conversations_by_session: dict[Optional[str], "_MemConversation"] = {}
    _mem_conversations_by_id: dict[int, "_MemConversation"] = {}
    # conv_id -> list[_MemMessage]
    _mem_messages: dict[int, list["_MemMessage"]] = {}


@dataclass
class _MemConversation:
    id: int
    session_id: Optional[str]
    theme: Optional[str]
    model: Optional[str]
    created_at: datetime


@dataclass
class _MemMessage:
    id: int
    conversation_id: int
    role: str
    content: str
    timestamp: datetime


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(128), index=True, nullable=True)
    theme = Column(String(256), nullable=True)
    model = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


def init_db():
    """Create tables if they do not exist."""
    if engine is not None:
        Base.metadata.create_all(bind=engine)
    else:
        print("DB persistence disabled (DB_ENABLED=False). Skipping table creation.")


def get_or_create_conversation(session_id: str | None, theme: str | None, model: str | None):
    # If DB persistence is enabled, use SQLAlchemy; otherwise use in-memory store
    if engine is not None:
        db = SessionLocal()
        try:
            conv = None
            if session_id:
                conv = (
                    db.query(Conversation)
                    .filter(Conversation.session_id == session_id)
                    .order_by(Conversation.created_at.desc())
                    .first()
                )
            if not conv:
                conv = Conversation(session_id=session_id, theme=theme, model=model)
                db.add(conv)
                db.commit()
                db.refresh(conv)
            return conv
        finally:
            db.close()
    else:
        global _mem_conv_next_id, _mem_conversations_by_session, _mem_conversations_by_id
        with _mem_lock:
            # try find by session_id
            if session_id and session_id in _mem_conversations_by_session:
                return _mem_conversations_by_session[session_id]

            conv_id = _mem_conv_next_id
            _mem_conv_next_id += 1
            conv = _MemConversation(id=conv_id, session_id=session_id, theme=theme, model=model, created_at=datetime.utcnow())
            _mem_conversations_by_id[conv_id] = conv
            if session_id:
                _mem_conversations_by_session[session_id] = conv
            _mem_messages[conv_id] = []
            return conv


def add_message(conversation_id: int, role: str, content: str):
    if engine is not None:
        db = SessionLocal()
        try:
            msg = ChatMessage(conversation_id=conversation_id, role=role, content=content)
            db.add(msg)
            db.commit()
            db.refresh(msg)
            return msg
        finally:
            db.close()
    else:
        global _mem_msg_next_id, _mem_messages
        with _mem_lock:
            msg_id = _mem_msg_next_id
            _mem_msg_next_id += 1
            msg = _MemMessage(id=msg_id, conversation_id=conversation_id, role=role, content=content, timestamp=datetime.utcnow())
            if conversation_id not in _mem_messages:
                _mem_messages[conversation_id] = []
            _mem_messages[conversation_id].append(msg)
            return msg


def get_last_message(conversation_id: int):
    if engine is not None:
        db = SessionLocal()
        try:
            return (
                db.query(ChatMessage)
                .filter(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.id.desc())
                .first()
            )
        finally:
            db.close()
    else:
        msgs = _mem_messages.get(conversation_id, [])
        return msgs[-1] if msgs else None


def get_history(conversation_id: int):
    if engine is not None:
        db = SessionLocal()
        try:
            msgs = (
                db.query(ChatMessage)
                .filter(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.id.asc())
                .all()
            )
            return msgs
        finally:
            db.close()
    else:
        return list(_mem_messages.get(conversation_id, []))
