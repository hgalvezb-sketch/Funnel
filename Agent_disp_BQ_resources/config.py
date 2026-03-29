"""
Configuración del Agent_disp_BQ - Sistema Predictivo
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class AgentConfig(BaseSettings):
    """Configuración principal del agente predictivo"""

    # BigQuery
    BQ_PROJECT_ID: str = "ws-ctrol-interno"
    BQ_LOCATION: str = "US"

    # Claude API
    ANTHROPIC_API_KEY: str
    CLAUDE_MODEL: str = "claude-opus-4-6"

    # Gemini API
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-2.0-flash-exp"

    # Umbrales de riesgo
    CRITICAL_THRESHOLD: int = 80
    HIGH_THRESHOLD: int = 40
    MEDIUM_THRESHOLD: int = 20

    # Presupuesto y control de costos
    FORCE_GEMINI_ONLY: bool = False
    MAX_CLAUDE_CALLS_PER_MONTH: int = 20
    CONFIRM_BEFORE_CLAUDE: bool = True

    # RAG (Fase 2)
    ENABLE_RAG: bool = False
    KNOWLEDGE_BASE_PATH: Optional[str] = None

    # Paths
    RESOURCES_DIR: Path = Path(__file__).parent
    QUERIES_DIR: Path = Path(__file__).parent / "queries"
    LOGS_DIR: Path = Path(__file__).parent / "logs"

    # Configuración de Pydantic
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Resolver KNOWLEDGE_BASE_PATH si no está definido
        if self.KNOWLEDGE_BASE_PATH is None:
            self.KNOWLEDGE_BASE_PATH = str(self.RESOURCES_DIR / "knowledge_base")


# Singleton global
_config: Optional[AgentConfig] = None


def get_config() -> AgentConfig:
    """
    Obtiene la configuración global del agente.
    Carga desde .env en primera invocación.
    """
    global _config
    if _config is None:
        _config = AgentConfig()
    return _config


def reload_config() -> AgentConfig:
    """Recarga la configuración desde .env"""
    global _config
    _config = AgentConfig()
    return _config
