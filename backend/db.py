import os
from pathlib import Path
from datetime import datetime

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

# DATABASE URL: expect MariaDB URL in env variable DATABASE_URL
# Example: mysql+pymysql://chatuser:password@localhost:3306/chatdb
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # fallback to local sqlite for development if DATABASE_URL not provided
    base_dir = Path(__file__).resolve().parent
    DATABASE_URL = f"sqlite:///{base_dir / 'chat_history.db'}"

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


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
    Base.metadata.create_all(bind=engine)


def get_or_create_conversation(session_id: str | None, theme: str | None, model: str | None):
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


def add_message(conversation_id: int, role: str, content: str):
    db = SessionLocal()
    try:
        msg = ChatMessage(conversation_id=conversation_id, role=role, content=content)
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg
    finally:
        db.close()


def get_last_message(conversation_id: int):
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


def get_history(conversation_id: int):
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
