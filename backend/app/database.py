"""
Database configuration and models for CardioScreen learning system.
Uses PostgreSQL for persistent storage of laudos, lessons, and feedback.
"""

import os
from datetime import datetime
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# Get DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Handle different database types
if DATABASE_URL.startswith("sqlite"):
    # SQLite configuration
    engine = create_engine(
        DATABASE_URL,
        echo=False  # Set to True for SQL debugging
    )
elif DATABASE_URL.startswith("postgres://"):
    # Render uses postgres:// but SQLAlchemy needs postgresql://
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_recycle=300,    # Recycle connections after 5 minutes
        echo=False           # Set to True for SQL debugging
    )
elif DATABASE_URL.startswith("postgresql://"):
    # PostgreSQL already in correct format
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_recycle=300,    # Recycle connections after 5 minutes
        echo=False           # Set to True for SQL debugging
    )
else:
    # Fallback for local development - use SQLite
    DATABASE_URL = "sqlite:///./cardioscreen_local.db"
    engine = create_engine(
        DATABASE_URL,
        echo=False
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class LaudoProcessado(Base):
    """
    Stores every processed laudo with its analysis results.
    This is the main table for historical data.
    """
    __tablename__ = "laudos_processados"

    id = Column(Integer, primary_key=True, index=True)
    
    # File information
    arquivo = Column(String(500), nullable=False)
    arquivo_tipo = Column(String(50))  # pdf, image, txt
    arquivo_path = Column(String(1000))  # Path to stored file
    
    # Original content
    texto_original = Column(Text)  # Full text extracted from laudo
    
    # Analysis results (stored as JSON for flexibility)
    analise = Column(JSON, nullable=False)
    """
    Expected structure:
    {
        "prioridade": "alta|media|baixa",
        "gravidade": "leve|moderada|importante|grave|critica",
        "indicacao_tavi": true|false,
        "justificativa_tavi": "...",
        "area_valvar": 0.8,
        "gradiente_medio": 45,
        "gradiente_pico": 72,
        "feve": 55,
        "achados_principais": ["..."],
        "recomendacoes": ["..."],
        "paciente": {"nome": "...", "idade": 75, "sexo": "M"}
    }
    """
    
    # Metadata
    lessons_count = Column(Integer, default=0)  # How many lessons were active when analyzed
    modelo_ia = Column(String(100), default="claude-haiku-4-5-20251001")
    recebeu_feedback = Column(Boolean, default=False)  # Se já recebeu feedback médico
    editado_manualmente = Column(Boolean, default=False)  # Se foi editado manualmente
    analise_antes_edicao = Column(JSON)  # Snapshot da análise antes de editar
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    editado_em = Column(DateTime)  # Quando foi editado manualmente
    corrigido_em = Column(DateTime)  # Quando recebeu feedback médico
    
    # Relationships
    feedbacks = relationship("Feedback", back_populates="laudo", cascade="all, delete-orphan")
    
    # Note: JSON indexes would require PostgreSQL-specific syntax
    # For now, we rely on the created_at index for queries


class LessonLearned(Base):
    """
    Stores learned rules from doctor feedback.
    These are incorporated into the system prompt for future analyses.
    """
    __tablename__ = "lessons_learned"

    id = Column(Integer, primary_key=True, index=True)
    
    # The lesson content
    regra = Column(Text, nullable=False)  # The clinical rule learned
    quando_aplicar = Column(Text)  # When to apply this rule
    exemplo = Column(Text)  # Example case
    categoria = Column(String(100))  # e.g., "estenose_aortica", "feve", "gradiente"
    
    # Control flags
    ativo = Column(Boolean, default=True, index=True)
    aprovado = Column(Boolean, default=True)  # For future moderation
    
    # Metadata
    vezes_aplicada = Column(Integer, default=0)  # Track usage
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    feedback = relationship("Feedback", back_populates="lesson", uselist=False)


class Feedback(Base):
    """
    Links a laudo to doctor's correction and the lesson generated.
    This is the bridge table that tracks the learning process.
    """
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    laudo_id = Column(Integer, ForeignKey("laudos_processados.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("lessons_learned.id", ondelete="SET NULL"), nullable=True)
    
    # Doctor's correction
    correcao_medico = Column(Text, nullable=False)  # What the doctor said was wrong
    
    # Analysis context (snapshot at time of feedback)
    analise_original = Column(JSON)  # The analysis that was corrected
    
    # Processing status
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    erro = Column(Text)  # Error message if failed
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime)
    
    # Relationships
    laudo = relationship("LaudoProcessado", back_populates="feedbacks")
    lesson = relationship("LessonLearned", back_populates="feedback")


def init_db():
    """
    Initialize database tables.
    Called on application startup.
    """
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized")


def get_db():
    """
    Dependency for FastAPI endpoints.
    Yields a database session and ensures cleanup.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_active_lessons(db) -> list[LessonLearned]:
    """
    Get all active lessons for prompt enrichment.
    """
    return db.query(LessonLearned).filter(
        LessonLearned.ativo == True,
        LessonLearned.aprovado == True
    ).order_by(LessonLearned.created_at.desc()).all()


def format_lessons_for_prompt(lessons: list[LessonLearned]) -> str:
    """
    Format lessons into a string for the system prompt.
    """
    if not lessons:
        return ""
    
    lines = ["\n\n=== APRENDIZADOS CLÍNICOS (baseados em feedback de especialistas) ===\n"]
    
    for i, lesson in enumerate(lessons, 1):
        lines.append(f"\n📌 Regra #{i}: {lesson.regra}")
        if lesson.quando_aplicar:
            lines.append(f"   Quando aplicar: {lesson.quando_aplicar}")
        if lesson.exemplo:
            lines.append(f"   Exemplo: {lesson.exemplo}")
    
    lines.append("\n\nAplique estes aprendizados nas suas análises.\n")
    
    return "\n".join(lines)
