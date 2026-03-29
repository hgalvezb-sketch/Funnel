# Agent_disp_BQ Modalidad Predictiva - Implementación Fase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de detección predictiva de fraudes en disposiciones usando motor híbrido Gemini/Claude con scoring automático de riesgos.

**Architecture:** Motor dual (operativo/predictivo) que ejecuta queries BigQuery, calcula scoring de riesgo basado en 13 banderas, decide inteligentemente entre Gemini 2.5 Flash (screening) o Claude Opus 4.6 (análisis forense), y genera respuestas conversacionales ejecutivas.

**Tech Stack:** Python 3.11, BigQuery, Claude API (Anthropic), Gemini API (Google AI), Pydantic, Rich

---

## File Structure

```
C:\Users\Administrador\.claude\agents\
├── Agent_disp_BQ.md                              # Actualizar con modo dual
└── Agent_disp_BQ_resources\                      # Nueva carpeta
    ├── __init__.py                               # Package marker
    ├── config.py                                 # Configuración con Pydantic
    ├── bigquery_client.py                        # Cliente BigQuery
    ├── risk_scoring.py                           # Sistema de scoring
    ├── llm_router.py                             # Decisión Gemini vs Claude
    ├── prompts.py                                # Templates de prompts
    ├── analyzer.py                               # Orquestador principal
    ├── requirements.txt                          # Dependencias Python
    ├── .env.example                              # Template configuración
    ├── .env                                      # Configuración local (gitignore)
    ├── queries\                                  # SQL templates
    │   ├── base_disposiciones.sql                # Query base usuario
    │   ├── analisis_empleado.sql                 # Query por empleado
    │   ├── analisis_sucursal.sql                 # Query por sucursal
    │   └── analisis_contrato.sql                 # Query por contrato
    └── logs\                                     # Logs de análisis
        ├── .gitkeep                              # Mantener dir en git
        └── usage_monthly.json                    # Tracking uso LLMs
```

---

## Task 1: Setup Inicial - Estructura de Directorios y Dependencias

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\requirements.txt`
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\.env.example`
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\__init__.py`
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\logs\.gitkeep`
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\queries\.gitkeep`

- [ ] **Step 1: Crear estructura de directorios**

```bash
cd C:\Users\Administrador\.claude\agents
mkdir -p Agent_disp_BQ_resources\queries Agent_disp_BQ_resources\logs
```

- [ ] **Step 2: Crear requirements.txt con dependencias**

```txt
# Google Cloud
google-cloud-bigquery==3.25.0

# LLM APIs
anthropic==0.34.0
google-generativeai==0.8.0
httpx==0.27.0

# Configuración y validación
python-dotenv==1.0.1
pydantic==2.9.0
pydantic-settings==2.5.0

# Utilidades
rich==13.8.0
tenacity==8.5.0

# Testing (opcional para Fase 1)
pytest==8.3.0
```

- [ ] **Step 3: Crear .env.example como template**

```bash
# BigQuery
BQ_PROJECT_ID=ws-ctrol-interno
BQ_LOCATION=US

# Claude API (obtener de https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# Gemini API (obtener de https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=...

# Umbrales de riesgo
CRITICAL_THRESHOLD=80
HIGH_THRESHOLD=40

# Presupuesto
FORCE_GEMINI_ONLY=false
MAX_CLAUDE_CALLS_PER_MONTH=20
CONFIRM_BEFORE_CLAUDE=true

# RAG (Fase 2)
ENABLE_RAG=false
```

- [ ] **Step 4: Crear marcadores de directorios**

Crear `Agent_disp_BQ_resources\__init__.py`:
```python
"""Agent_disp_BQ Resources - Sistema predictivo de detección de fraudes"""
__version__ = "1.0.0"
```

Crear `Agent_disp_BQ_resources\logs\.gitkeep` (archivo vacío)

Crear `Agent_disp_BQ_resources\queries\.gitkeep` (archivo vacío)

- [ ] **Step 5: Instalar dependencias**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
pip install -r requirements.txt
```

Expected output: Successfully installed google-cloud-bigquery-3.25.0 anthropic-0.34.0 ...

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Administrador\.claude\agents
git add Agent_disp_BQ_resources/
git commit -m "feat(agent-disp-bq): setup inicial estructura predictivo

- Estructura directorios Agent_disp_BQ_resources
- requirements.txt con dependencias
- .env.example como template
- Directorios queries/ y logs/

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Configuración - config.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\config.py`

- [ ] **Step 1: Crear config.py con Pydantic Settings**

```python
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
```

- [ ] **Step 2: Verificar que config.py es válido**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
python -c "from config import get_config; print('Config OK')"
```

Expected: Error "ANTHROPIC_API_KEY field required" (correcto, aún no hay .env)

- [ ] **Step 3: Commit**

```bash
git add config.py
git commit -m "feat(agent-disp-bq): agregar configuracion con Pydantic

- AgentConfig con validacion de settings
- Singleton global get_config()
- Soporte .env file
- Paths autoconfigurables

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Cliente BigQuery - bigquery_client.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\bigquery_client.py`

- [ ] **Step 1: Crear bigquery_client.py**

```python
"""
Cliente BigQuery para Agent_disp_BQ
Ejecuta queries y retorna resultados en formato estructurado
"""
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from google.cloud import bigquery
from google.api_core import exceptions
from config import get_config


class BigQueryClient:
    """Cliente para ejecutar queries BigQuery"""

    def __init__(self):
        self.config = get_config()
        self.client = bigquery.Client(
            project=self.config.BQ_PROJECT_ID,
            location=self.config.BQ_LOCATION
        )

    def execute_query(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        max_results: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Ejecuta una query BigQuery y retorna resultados como lista de dicts

        Args:
            query: SQL query a ejecutar
            params: Parámetros para query parametrizada (opcional)
            max_results: Máximo número de resultados a retornar

        Returns:
            Lista de diccionarios con los resultados

        Raises:
            BigQueryError: Si la query falla
        """
        try:
            job_config = bigquery.QueryJobConfig()

            # Si hay parámetros, configurar query parametrizada
            if params:
                query_params = []
                for key, value in params.items():
                    param_type = self._infer_param_type(value)
                    query_params.append(
                        bigquery.ScalarQueryParameter(key, param_type, value)
                    )
                job_config.query_parameters = query_params

            # Ejecutar query
            query_job = self.client.query(query, job_config=job_config)

            # Obtener resultados
            results = []
            for row in query_job.result(max_results=max_results):
                # Convertir Row a dict
                row_dict = dict(row.items())
                # Convertir tipos no serializables
                row_dict = self._serialize_row(row_dict)
                results.append(row_dict)

            return results

        except exceptions.GoogleAPIError as e:
            raise BigQueryError(f"Error ejecutando query: {str(e)}") from e

    def execute_query_from_file(
        self,
        query_file: str,
        params: Optional[Dict[str, Any]] = None,
        max_results: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Ejecuta una query desde un archivo SQL

        Args:
            query_file: Nombre del archivo en queries/ (sin path completo)
            params: Parámetros para la query
            max_results: Máximo número de resultados

        Returns:
            Lista de diccionarios con los resultados
        """
        query_path = self.config.QUERIES_DIR / query_file

        if not query_path.exists():
            raise FileNotFoundError(f"Query file not found: {query_path}")

        with open(query_path, "r", encoding="utf-8") as f:
            query = f.read()

        # Reemplazar parámetros en el SQL si es query template
        if params:
            query = self._replace_template_params(query, params)

        return self.execute_query(query, max_results=max_results)

    def _infer_param_type(self, value: Any) -> str:
        """Infiere el tipo de parámetro BigQuery"""
        if isinstance(value, bool):
            return "BOOL"
        elif isinstance(value, int):
            return "INT64"
        elif isinstance(value, float):
            return "FLOAT64"
        elif isinstance(value, str):
            return "STRING"
        else:
            return "STRING"  # Fallback

    def _serialize_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Convierte tipos no serializables a JSON"""
        serialized = {}
        for key, value in row.items():
            if value is None:
                serialized[key] = None
            elif isinstance(value, (str, int, float, bool)):
                serialized[key] = value
            elif hasattr(value, "isoformat"):  # datetime, date
                serialized[key] = value.isoformat()
            else:
                serialized[key] = str(value)
        return serialized

    def _replace_template_params(self, query: str, params: Dict[str, Any]) -> str:
        """Reemplaza parámetros template en SQL (ej: {dias_atras})"""
        for key, value in params.items():
            placeholder = f"{{{key}}}"
            if placeholder in query:
                if isinstance(value, str):
                    query = query.replace(placeholder, f"'{value}'")
                else:
                    query = query.replace(placeholder, str(value))
        return query

    def get_query_cost_estimate(self, query: str) -> Dict[str, Any]:
        """
        Estima el costo de una query sin ejecutarla (dry run)

        Returns:
            Dict con bytes_processed y costo estimado en USD
        """
        job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)

        try:
            query_job = self.client.query(query, job_config=job_config)

            bytes_processed = query_job.total_bytes_processed
            # BigQuery pricing: $5 per TB in US region
            cost_usd = (bytes_processed / (1024**4)) * 5

            return {
                "bytes_processed": bytes_processed,
                "bytes_processed_mb": round(bytes_processed / (1024**2), 2),
                "cost_usd": round(cost_usd, 6)
            }

        except exceptions.GoogleAPIError as e:
            raise BigQueryError(f"Error en dry run: {str(e)}") from e


class BigQueryError(Exception):
    """Excepción personalizada para errores de BigQuery"""
    pass
```

- [ ] **Step 2: Verificar imports**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
python -c "from bigquery_client import BigQueryClient; print('BigQueryClient OK')"
```

Expected: Error de .env (correcto, continuamos)

- [ ] **Step 3: Commit**

```bash
git add bigquery_client.py
git commit -m "feat(agent-disp-bq): agregar cliente BigQuery

- Ejecucion de queries con resultados como dicts
- Soporte queries desde archivos SQL
- Estimacion de costos (dry run)
- Serializacion automatica de tipos

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Sistema de Scoring - risk_scoring.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\risk_scoring.py`

- [ ] **Step 1: Crear risk_scoring.py con banderas y scoring**

```python
"""
Sistema de Scoring de Riesgos para Agent_disp_BQ
Calcula scores basados en banderas de riesgo detectadas
"""
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass
from enum import Enum


class RiskLevel(str, Enum):
    """Niveles de riesgo"""
    CRITICO = "CRÍTICO"
    ALTO = "ALTO"
    MEDIO = "MEDIO"
    BAJO = "BAJO"


@dataclass
class RiskFlag:
    """Representa una bandera de riesgo"""
    name: str
    column_name: str
    points: int
    category: RiskLevel


# Definición de banderas de riesgo basadas en columnas del sheet bd_disp
RISK_FLAGS = [
    RiskFlag("Tel de Colaborador", "| Tel de Colaborador |", 35, RiskLevel.CRITICO),
    RiskFlag("Contratos <3min", "| != contratos en menos de 3 min |", 35, RiskLevel.CRITICO),
    RiskFlag("Pago SPEI Colab", "| Pago SPEI Colab |", 40, RiskLevel.CRITICO),
    RiskFlag("Monto duplicado", "| Monto duplicado mismo día |", 30, RiskLevel.CRITICO),
    RiskFlag("+1 mismo día", "| +1 mismo día |", 25, RiskLevel.ALTO),
    RiskFlag("Fuera horario", "| fuera de horario |", 20, RiskLevel.ALTO),
    RiskFlag("Foráneas efectivo", "| Foraneas_en_efectivo |", 20, RiskLevel.ALTO),
    RiskFlag("Tel repetido", "| Tel repetido distintos contratos |", 25, RiskLevel.ALTO),
    RiskFlag("En quincena", "| en Quincena |", 10, RiskLevel.MEDIO),
    RiskFlag("Calificación ≤5", "| Calificación <= 5 |", 15, RiskLevel.MEDIO),
    RiskFlag(">120 días", "| > 120 días |", 15, RiskLevel.MEDIO),
    RiskFlag("Disp >1K", "Disp>1k   C525", 10, RiskLevel.BAJO),
    RiskFlag("Disp >24K", "Disposiciones >24k", 12, RiskLevel.BAJO),
]

# Multiplicadores de riesgo
MULTIPLICADORES = {
    "multiple_flags": 1.5,       # 2+ flags activas
    "empleado_repetido": 2.0,    # Mismo empleado múltiples flags
    "sucursal_patron": 1.8,      # Sucursal con patrón repetido
    "cluster_temporal": 1.6      # Múltiples casos mismo día
}


class RiskScorer:
    """Calcula scores de riesgo para disposiciones"""

    def __init__(self):
        self.flags = RISK_FLAGS

    def calculate_score(self, disposicion: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calcula el score de riesgo de una disposición

        Args:
            disposicion: Dict con datos de la disposición (incluyendo columnas de banderas)

        Returns:
            Dict con score, nivel, banderas activas, etc.
        """
        active_flags = []
        total_score = 0

        # Detectar banderas activas
        for flag in self.flags:
            column_value = disposicion.get(flag.column_name)
            if column_value is not None and column_value != "":
                active_flags.append({
                    "name": flag.name,
                    "points": flag.points,
                    "category": flag.category.value
                })
                total_score += flag.points

        # Aplicar multiplicadores si aplica
        num_flags = len(active_flags)
        multiplier = 1.0

        if num_flags >= 2:
            multiplier *= MULTIPLICADORES["multiple_flags"]

        total_score = int(total_score * multiplier)

        # Determinar nivel de riesgo
        risk_level = self.categorize_risk(total_score, num_flags)

        # Identificar patrón dominante
        patron = self.identify_pattern(active_flags, disposicion)

        return {
            "risk_score": total_score,
            "risk_level": risk_level.value,
            "num_flags": num_flags,
            "active_flags": active_flags,
            "multiplier": multiplier,
            "patron_sospechoso": patron
        }

    def categorize_risk(self, score: int, num_flags: int) -> RiskLevel:
        """
        Categoriza el nivel de riesgo basado en score y número de banderas

        Args:
            score: Puntuación total de riesgo
            num_flags: Número de banderas activas

        Returns:
            RiskLevel enum
        """
        if score >= 80 or num_flags >= 3:
            return RiskLevel.CRITICO
        elif score >= 40 or num_flags >= 2:
            return RiskLevel.ALTO
        elif score >= 20:
            return RiskLevel.MEDIO
        else:
            return RiskLevel.BAJO

    def identify_pattern(
        self,
        active_flags: List[Dict[str, Any]],
        disposicion: Dict[str, Any]
    ) -> str:
        """
        Identifica el patrón de fraude dominante basado en banderas activas

        Returns:
            Descripción del patrón detectado
        """
        flag_names = [f["name"] for f in active_flags]

        # Colusión empleado-cliente
        if "Tel de Colaborador" in flag_names or "Pago SPEI Colab" in flag_names:
            return "Colusión empleado-cliente"

        # Fraccionamiento
        if "Contratos <3min" in flag_names or "+1 mismo día" in flag_names:
            return "Fraccionamiento"

        # Horario irregular
        if "Fuera horario" in flag_names:
            return "Horario irregular"

        # Identidad sintética posible
        if "Tel repetido" in flag_names:
            return "Identidad sintética posible"

        # Riesgo crediticio alto
        if "Calificación ≤5" in flag_names or ">120 días" in flag_names:
            return "Riesgo crediticio alto"

        return "Otro"

    def score_batch(self, disposiciones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Calcula scores para un batch de disposiciones

        Returns:
            Lista de disposiciones con scoring añadido
        """
        scored_disposiciones = []

        for disp in disposiciones:
            scoring = self.calculate_score(disp)
            # Combinar datos originales con scoring
            scored_disp = {**disp, **scoring}
            scored_disposiciones.append(scored_disp)

        # Ordenar por risk_score descendente
        scored_disposiciones.sort(key=lambda x: x["risk_score"], reverse=True)

        return scored_disposiciones

    def filter_by_risk_level(
        self,
        disposiciones: List[Dict[str, Any]],
        min_level: RiskLevel
    ) -> List[Dict[str, Any]]:
        """
        Filtra disposiciones por nivel mínimo de riesgo

        Args:
            disposiciones: Lista de disposiciones con scoring
            min_level: Nivel mínimo de riesgo a incluir

        Returns:
            Lista filtrada
        """
        level_order = {
            RiskLevel.BAJO: 0,
            RiskLevel.MEDIO: 1,
            RiskLevel.ALTO: 2,
            RiskLevel.CRITICO: 3
        }

        min_level_order = level_order[min_level]

        return [
            d for d in disposiciones
            if level_order.get(RiskLevel(d["risk_level"]), 0) >= min_level_order
        ]
```

- [ ] **Step 2: Crear test simple de scoring**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
python -c "
from risk_scoring import RiskScorer, RiskLevel

scorer = RiskScorer()

# Test: disposición con 2 banderas críticas
test_disp = {
    '| Tel de Colaborador |': 'X',
    '| Pago SPEI Colab |': 'X',
    'contrato': 'CTR-12345'
}

result = scorer.calculate_score(test_disp)
print(f'Score: {result[\"risk_score\"]}')
print(f'Level: {result[\"risk_level\"]}')
print(f'Pattern: {result[\"patron_sospechoso\"]}')

assert result['risk_level'] == RiskLevel.CRITICO.value
print('✓ Test passed')
"
```

Expected output:
```
Score: 112  # (35 + 40) * 1.5 multiplicador
Level: CRÍTICO
Pattern: Colusión empleado-cliente
✓ Test passed
```

- [ ] **Step 3: Commit**

```bash
git add risk_scoring.py
git commit -m "feat(agent-disp-bq): agregar sistema de scoring de riesgos

- 13 banderas de riesgo con puntuacion
- Multiplicadores para flags multiples
- Categorizacion automatica (CRITICO/ALTO/MEDIO/BAJO)
- Identificacion de patrones de fraude
- Batch scoring y filtrado

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Templates de Prompts - prompts.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\prompts.py`

- [ ] **Step 1: Crear prompts.py con templates**

```python
"""
Templates de Prompts para LLMs (Claude Opus 4.6 y Gemini 2.5 Flash)
"""
import json
from typing import Dict, List, Any


FINDEP_CONTEXT = """
Eres un analista experto en auditoría, control interno y detección de fraudes para FINDEP
(Financiera Independencia), institución mexicana de microfinanzas regulada por CNBV.

CONTEXTO REGULATORIO:
- Operación: México y Estados Unidos
- Marco legal: LFPDPPP (México), BSA/AML (US)
- Supervisor: CNBV, CONDUSEF
- Productos: Créditos revolventes para población de bajos ingresos

PATRONES DE FRAUDE CONOCIDOS:
1. Colusión empleado-cliente: Empleado procesa disposiciones coordinadas con clientes cómplices
2. Fraccionamiento: Múltiples disposiciones para evadir límites de aprobación
3. Horarios irregulares: Operaciones fuera de horario oficial para evadir supervisión
4. Identidades sintéticas: Clientes con datos duplicados/compartidos
5. Lavado de dinero: Disposiciones-pagos circulares, estructuración

TU AUDIENCIA:
Alta dirección, Comité de Riesgos, Comité de Auditoría.
Tono: Ejecutivo, basado en evidencia, orientado a decisiones.
NO uses emojis en análisis formales.
NUNCA expongas PII (nombres completos, teléfonos, CURP) en tus respuestas.
"""


def build_claude_critical_prompt(disposiciones_criticas: List[Dict[str, Any]]) -> str:
    """
    Construye prompt para Claude Opus 4.6 - Casos críticos (score ≥80)

    Args:
        disposiciones_criticas: Lista de disposiciones con score crítico

    Returns:
        Prompt completo para Claude
    """
    return f"""
{FINDEP_CONTEXT}

TAREA: Análisis forense de disposiciones de alto riesgo

DATOS DETECTADOS:
{json.dumps(disposiciones_criticas, indent=2, ensure_ascii=False)}

INSTRUCCIONES:
1. Identifica el tipo de fraude más probable (colusión, lavado, suplantación, fraccionamiento, otro)
2. Describe la mecánica específica del esquema detectado paso a paso
3. Cuantifica el impacto financiero y reputacional estimado
4. Identifica actores involucrados (empleados, clientes, sucursales) sin exponer PII
5. Recomienda acciones inmediatas (bloqueos temporales, investigaciones, auditorías)
6. Sugiere controles preventivos específicos para evitar recurrencia

FORMATO DE RESPUESTA (JSON estricto):
{{
  "resumen_ejecutivo": "Párrafo de 2-3 oraciones para el CEO/Comité de Auditoría",
  "tipo_fraude": "Colusión empleado-cliente | Lavado de dinero | Fraccionamiento | Identidad sintética | Otro",
  "confianza": 0-100,
  "mecanica": "Descripción detallada del esquema paso a paso con evidencia específica",
  "actores": [
    {{
      "tipo": "empleado | cliente | sucursal",
      "identificador": "numero_empleado: XXXX o contrato: CTR-XXXX (sin nombres)",
      "rol": "orquestador | beneficiario | facilitador | víctima",
      "evidencia": ["factor1", "factor2", "factor3"]
    }}
  ],
  "impacto": {{
    "financiero_mxn": 123456.78,
    "operaciones_afectadas": 15,
    "periodo": "YYYY-MM-DD a YYYY-MM-DD",
    "reputacional": "Descripción breve de riesgo reputacional/regulatorio"
  }},
  "acciones_inmediatas": [
    {{
      "accion": "Descripción específica de la acción",
      "urgencia": "inmediata | 24h | 72h | 1 semana",
      "responsable_sugerido": "Auditoría Interna | Seguridad | Operaciones | Legal",
      "justificacion": "Por qué esta acción es necesaria"
    }}
  ],
  "controles_preventivos": [
    {{
      "control": "Descripción del control propuesto",
      "tipo": "Preventivo | Detectivo | Correctivo",
      "complejidad": "Baja | Media | Alta",
      "impacto_esperado": "Reducción estimada de riesgo (%)"
    }}
  ]
}}

IMPORTANTE:
- Este análisis será revisado por el Comité de Auditoría y potencialmente compartido con CNBV
- Sé preciso, basado en evidencia cuantitativa, y orientado a decisiones ejecutivas
- No hagas especulaciones sin fundamento
- Protege PII: usa solo identificadores (números de empleado, contratos)
"""


def build_gemini_screening_prompt(disposiciones_moderadas: List[Dict[str, Any]]) -> str:
    """
    Construye prompt para Gemini 2.5 Flash - Screening (score 40-79)

    Args:
        disposiciones_moderadas: Lista de disposiciones con score alto/medio

    Returns:
        Prompt completo para Gemini
    """
    return f"""
{FINDEP_CONTEXT}

TAREA: Screening rápido de disposiciones con alertas de riesgo medio-alto

DATOS:
{json.dumps(disposiciones_moderadas, indent=2, ensure_ascii=False)}

INSTRUCCIONES:
1. Identifica patrones anómalos que requieren atención operativa
2. Prioriza casos por nivel de riesgo (alto > medio > bajo)
3. Sugiere próximos pasos de investigación específicos
4. Genera alertas operativas accionables para equipos de sucursal

FORMATO DE RESPUESTA JSON:
{{
  "total_casos": 25,
  "distribucion": {{
    "altos": 8,
    "medios": 15,
    "bajos": 2
  }},
  "casos_prioritarios": [
    {{
      "id_disposicion": "DISP-XXXX",
      "contrato": "CTR-XXXX (sin nombre cliente)",
      "sucursal": 127,
      "riesgo": "alto | medio",
      "banderas": ["Tel de Colaborador", "+1 mismo día", "Fuera horario"],
      "monto_mxn": 24500.00,
      "patron_detectado": "Descripción breve del patrón (ej: 3 disposiciones en 10 min)",
      "recomendacion": "Acción específica (ej: Revisar video vigilancia caja 12, horario 14:00-15:30)"
    }}
  ],
  "tendencias": [
    {{
      "descripcion": "Descripción de la tendencia detectada",
      "periodo": "última semana | últimos 3 días",
      "magnitud": "Incremento/Reducción X%",
      "accion_sugerida": "Monitorear | Investigar | Escalar"
    }}
  ],
  "alertas_operativas": [
    "Alerta específica para área operativa (ej: Sucursal 127: 8 operaciones fuera de horario última semana)"
  ],
  "metricas_contexto": {{
    "promedio_diario_normal": 150,
    "promedio_periodo_analizado": 180,
    "desviacion_estandar": 12.5
  }}
}}

Sé conciso y accionable. Enfoque en operaciones, no análisis forense profundo.
"""


def build_conversational_response(
    analisis_llm: Dict[str, Any],
    nivel_riesgo: str
) -> str:
    """
    Convierte análisis JSON del LLM en respuesta conversacional

    Args:
        analisis_llm: Dict con análisis del LLM
        nivel_riesgo: "CRÍTICO" | "ALTO" | "MEDIO" | "BAJO"

    Returns:
        Texto formateado para respuesta conversacional
    """
    if nivel_riesgo == "CRÍTICO":
        return _format_critical_response(analisis_llm)
    elif nivel_riesgo == "ALTO":
        return _format_screening_response(analisis_llm)
    else:
        return _format_simple_response(analisis_llm)


def _format_critical_response(analisis: Dict[str, Any]) -> str:
    """Formatea respuesta para casos críticos"""

    actores_text = "\n".join([
        f"- {a['tipo'].upper()} {a['identificador']}: {a['rol']}"
        for a in analisis.get("actores", [])
    ])

    acciones_text = "\n".join([
        f"{i+1}. ⏱️ {a['urgencia'].upper()}: {a['accion']}"
        for i, a in enumerate(analisis.get("acciones_inmediatas", []))
    ])

    controles_text = "\n".join([
        f"- {c['control']} (impacto: {c.get('impacto_esperado', 'N/A')})"
        for c in analisis.get("controles_preventivos", [])
    ])

    return f"""
🔴 **ALERTA CRÍTICA DE FRAUDE**

{analisis.get('resumen_ejecutivo', '')}

**Tipo de fraude detectado:** {analisis.get('tipo_fraude', 'Desconocido')} (confianza: {analisis.get('confianza', 0)}%)

**Mecánica del esquema:**
{analisis.get('mecanica', 'Sin detalles')}

**Actores identificados:**
{actores_text}

**Impacto estimado:** ${analisis.get('impacto', {}).get('financiero_mxn', 0):,.2f} MXN en {analisis.get('impacto', {}).get('operaciones_afectadas', 0)} operaciones

**ACCIONES REQUERIDAS (INMEDIATAS):**
{acciones_text}

**Controles preventivos sugeridos:**
{controles_text}

---
¿Deseas que profundice en algún actor específico o que analice el histórico de esta sucursal?
"""


def _format_screening_response(analisis: Dict[str, Any]) -> str:
    """Formatea respuesta para screening"""

    dist = analisis.get("distribucion", {})
    casos_top = analisis.get("casos_prioritarios", [])[:3]

    casos_text = ""
    for i, caso in enumerate(casos_top, 1):
        banderas = ", ".join(caso.get("banderas", []))
        casos_text += f"""
[{i}] {caso.get('patron_detectado', 'Sin patrón')} - Sucursal {caso.get('sucursal', 'N/A')}
    Monto: ${caso.get('monto_mxn', 0):,.2f} MXN
    Banderas: {banderas}
    Recomendación: {caso.get('recomendacion', 'Sin recomendación')}
"""

    tendencias_text = "\n".join([
        f"- {t['descripcion']} ({t.get('magnitud', 'N/A')})"
        for t in analisis.get("tendencias", [])
    ])

    return f"""
🟡 **Screening Diario - {analisis.get('total_casos', 0)} casos analizados**

Distribución: {dist.get('criticos', 0)} críticos, {dist.get('altos', 0)} altos, {dist.get('medios', 0)} medios

**Top 3 casos prioritarios:**
{casos_text}

**Tendencias detectadas:**
{tendencias_text}

**Alertas operativas:**
{chr(10).join(['- ' + a for a in analisis.get('alertas_operativas', [])])}

---
¿Quieres que analice en profundidad algún caso o que compare con histórico?
"""


def _format_simple_response(analisis: Dict[str, Any]) -> str:
    """Formatea respuesta simple para casos de bajo riesgo"""
    return f"""
🟢 **Análisis completado**

{analisis.get('resumen', 'No se detectaron anomalías significativas en el periodo analizado.')}

Total de operaciones revisadas: {analisis.get('total_operaciones', 0)}
Anomalías menores detectadas: {analisis.get('anomalias_menores', 0)}

¿Deseas análisis más detallado de alguna operación específica?
"""
```

- [ ] **Step 2: Test de construcción de prompts**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
python -c "
from prompts import build_claude_critical_prompt

test_data = [{
    'id_disposicion': 'D12345',
    'risk_score': 110,
    'total_disposicion': 24500.00,
    'active_flags': [
        {'name': 'Tel de Colaborador', 'points': 35},
        {'name': 'Pago SPEI Colab', 'points': 40}
    ]
}]

prompt = build_claude_critical_prompt(test_data)
assert 'TAREA: Análisis forense' in prompt
assert 'JSON estricto' in prompt
print('✓ Prompts OK')
"
```

Expected: `✓ Prompts OK`

- [ ] **Step 3: Commit**

```bash
git add prompts.py
git commit -m "feat(agent-disp-bq): agregar templates de prompts LLM

- Contexto FINDEP compartido
- Prompt Claude Opus (casos criticos)
- Prompt Gemini Flash (screening)
- Formateo conversacional de respuestas
- Proteccion de PII

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Router LLM - llm_router.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\llm_router.py`

- [ ] **Step 1: Crear llm_router.py con decisión de modelo y clientes API**

```python
"""
Router LLM - Decide qué modelo usar (Claude vs Gemini) y ejecuta análisis
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from anthropic import Anthropic
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from config import get_config
from prompts import build_claude_critical_prompt, build_gemini_screening_prompt


class LLMRouter:
    """Router que decide entre Claude Opus 4.6 y Gemini 2.5 Flash"""

    def __init__(self):
        self.config = get_config()

        # Inicializar clientes
        self.claude_client = Anthropic(api_key=self.config.ANTHROPIC_API_KEY)
        genai.configure(api_key=self.config.GEMINI_API_KEY)

        # Tracking de uso
        self.usage_file = self.config.LOGS_DIR / "usage_monthly.json"

    def decide_model(
        self,
        risk_score: int,
        num_flags: int
    ) -> Optional[str]:
        """
        Decide qué modelo LLM usar basándose en score y configuración

        Args:
            risk_score: Score de riesgo calculado
            num_flags: Número de banderas activas

        Returns:
            "claude" | "gemini" | None (skip LLM)
        """
        # Opción 1: Forzar solo Gemini (ahorro)
        if self.config.FORCE_GEMINI_ONLY:
            return "gemini"

        # Opción 2: Casos críticos
        if risk_score >= self.config.CRITICAL_THRESHOLD or num_flags >= 3:
            # Verificar límite mensual de Claude
            if not self._check_claude_budget():
                print("⚠️ Límite mensual de Claude alcanzado. Usando Gemini.")
                return "gemini"

            # Opción 3: Pedir confirmación si está configurado
            if self.config.CONFIRM_BEFORE_CLAUDE:
                confirmar = input(
                    f"\nDetecté {num_flags} anomalías críticas (score={risk_score}).\n"
                    f"Análisis con Claude Opus 4.6 (costo ~$0.25).\n"
                    f"¿Proceder? [C]laude / [G]emini / [S]kip: "
                )
                if confirmar.upper() == 'C':
                    return "claude"
                elif confirmar.upper() == 'G':
                    return "gemini"
                else:
                    return None  # Skip análisis LLM

            return "claude"

        # Casos de riesgo alto/medio
        elif risk_score >= self.config.HIGH_THRESHOLD:
            return "gemini"

        # Casos de bajo riesgo: skip LLM
        else:
            return None

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_with_claude(
        self,
        disposiciones: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones críticas con Claude Opus 4.6

        Returns:
            Dict con análisis estructurado en JSON
        """
        prompt = build_claude_critical_prompt(disposiciones)

        try:
            response = self.claude_client.messages.create(
                model=self.config.CLAUDE_MODEL,
                max_tokens=4000,
                temperature=0.3,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            # Extraer JSON del contenido
            content = response.content[0].text
            analisis = self._extract_json(content)

            # Registrar uso
            self._track_usage("claude", response.usage.input_tokens, response.usage.output_tokens)

            return analisis

        except Exception as e:
            print(f"❌ Error en Claude API: {str(e)}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_with_gemini(
        self,
        disposiciones: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones con Gemini 2.5 Flash

        Returns:
            Dict con análisis estructurado en JSON
        """
        prompt = build_gemini_screening_prompt(disposiciones)

        try:
            model = genai.GenerativeModel(self.config.GEMINI_MODEL)

            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.3,
                    max_output_tokens=2048
                )
            )

            # Parsear JSON
            analisis = json.loads(response.text)

            # Registrar uso (estimado)
            self._track_usage("gemini", estimated_input_tokens=len(prompt)//4, estimated_output_tokens=len(response.text)//4)

            return analisis

        except Exception as e:
            print(f"❌ Error en Gemini API: {str(e)}")
            raise

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extrae JSON del texto de respuesta"""
        # Intentar parsear directamente
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Buscar JSON entre code blocks
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            json_text = text[start:end].strip()
            return json.loads(json_text)

        # Buscar JSON entre llaves
        if "{" in text and "}" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            json_text = text[start:end]
            return json.loads(json_text)

        raise ValueError("No se pudo extraer JSON de la respuesta")

    def _check_claude_budget(self) -> bool:
        """Verifica si hay presupuesto disponible para Claude"""
        mes_actual = datetime.now().strftime("%Y-%m")

        try:
            if self.usage_file.exists():
                with open(self.usage_file, "r") as f:
                    tracking = json.load(f)

                if mes_actual in tracking:
                    claude_calls = tracking[mes_actual].get("claude_calls", 0)
                    if claude_calls >= self.config.MAX_CLAUDE_CALLS_PER_MONTH:
                        return False
        except Exception:
            pass  # Si hay error, permitir uso

        return True

    def _track_usage(
        self,
        modelo: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        estimated_input_tokens: int = 0,
        estimated_output_tokens: int = 0
    ):
        """Registra uso de LLM para tracking de costos"""
        mes_actual = datetime.now().strftime("%Y-%m")

        # Calcular costo estimado
        if modelo == "claude":
            # Claude Opus 4.6: $15/MTok input, $75/MTok output
            cost = (input_tokens / 1_000_000) * 15 + (output_tokens / 1_000_000) * 75
            tokens_in = input_tokens
            tokens_out = output_tokens
        else:  # gemini
            # Gemini Flash: gratis hasta 15 RPM, luego ~$0.075/MTok input, $0.30/MTok output
            cost = (estimated_input_tokens / 1_000_000) * 0.075 + (estimated_output_tokens / 1_000_000) * 0.30
            tokens_in = estimated_input_tokens
            tokens_out = estimated_output_tokens

        # Cargar tracking
        if self.usage_file.exists():
            with open(self.usage_file, "r") as f:
                tracking = json.load(f)
        else:
            tracking = {}

        if mes_actual not in tracking:
            tracking[mes_actual] = {
                "claude_calls": 0,
                "claude_cost_usd": 0,
                "claude_tokens_in": 0,
                "claude_tokens_out": 0,
                "gemini_calls": 0,
                "gemini_cost_usd": 0,
                "gemini_tokens_in": 0,
                "gemini_tokens_out": 0,
                "total_cost_usd": 0
            }

        # Actualizar
        if modelo == "claude":
            tracking[mes_actual]["claude_calls"] += 1
            tracking[mes_actual]["claude_cost_usd"] += cost
            tracking[mes_actual]["claude_tokens_in"] += tokens_in
            tracking[mes_actual]["claude_tokens_out"] += tokens_out
        else:
            tracking[mes_actual]["gemini_calls"] += 1
            tracking[mes_actual]["gemini_cost_usd"] += cost
            tracking[mes_actual]["gemini_tokens_in"] += tokens_in
            tracking[mes_actual]["gemini_tokens_out"] += tokens_out

        tracking[mes_actual]["total_cost_usd"] = (
            tracking[mes_actual]["claude_cost_usd"] +
            tracking[mes_actual]["gemini_cost_usd"]
        )

        # Guardar
        self.usage_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.usage_file, "w") as f:
            json.dump(tracking, f, indent=2)
```

- [ ] **Step 2: Commit**

```bash
git add llm_router.py
git commit -m "feat(agent-disp-bq): agregar router LLM hibrido

- Decision inteligente Claude vs Gemini
- Clientes API con retry logic
- Tracking de uso y costos
- Confirmacion antes de Claude
- Respeto a limites presupuestarios

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Analyzer Principal - analyzer.py

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\analyzer.py`

- [ ] **Step 1: Crear analyzer.py - orquestador principal**

```python
"""
Analyzer Principal - Orquestador del pipeline predictivo
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from bigquery_client import BigQueryClient, BigQueryError
from risk_scoring import RiskScorer, RiskLevel
from llm_router import LLMRouter
from prompts import build_conversational_response
from config import get_config


console = Console()


class PredictiveAnalyzer:
    """Orquestador principal del análisis predictivo"""

    def __init__(self):
        self.config = get_config()
        self.bq_client = BigQueryClient()
        self.scorer = RiskScorer()
        self.llm_router = LLMRouter()

    def analyze_periodo(
        self,
        dias_atras: int = 3,
        max_results: int = 500
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones de los últimos N días

        Args:
            dias_atras: Número de días atrás a analizar
            max_results: Máximo de resultados a procesar

        Returns:
            Dict con análisis completo
        """
        console.print(f"\n[bold blue]Analizando disposiciones últimos {dias_atras} días...[/bold blue]")

        # 1. Ejecutar query BigQuery
        try:
            params = {"dias_atras": dias_atras}
            disposiciones = self.bq_client.execute_query_from_file(
                "base_disposiciones.sql",
                params=params,
                max_results=max_results
            )
        except (BigQueryError, FileNotFoundError) as e:
            console.print(f"[red]❌ Error ejecutando query: {str(e)}[/red]")
            return {"error": str(e)}

        if not disposiciones:
            console.print("[yellow]No se encontraron disposiciones en el periodo.[/yellow]")
            return {"total": 0, "anomalias": []}

        console.print(f"[green]✓ {len(disposiciones)} disposiciones obtenidas[/green]")

        # 2. Calcular scoring
        console.print("[blue]Calculando scores de riesgo...[/blue]")
        scored_disposiciones = self.scorer.score_batch(disposiciones)

        # 3. Filtrar anomalías (score > 0)
        anomalias = [d for d in scored_disposiciones if d["risk_score"] > 0]

        if not anomalias:
            console.print("[green]✓ No se detectaron anomalías.[/green]")
            return {
                "total": len(disposiciones),
                "anomalias": [],
                "mensaje": "No se detectaron anomalías en el periodo analizado."
            }

        console.print(f"[yellow]⚠️  {len(anomalias)} anomalías detectadas[/yellow]")

        # 4. Categorizar por nivel de riesgo
        criticas = [a for a in anomalias if a["risk_level"] == RiskLevel.CRITICO.value]
        altas = [a for a in anomalias if a["risk_level"] == RiskLevel.ALTO.value]
        medias = [a for a in anomalias if a["risk_level"] == RiskLevel.MEDIO.value]

        self._print_summary_table(len(disposiciones), criticas, altas, medias)

        # 5. Análisis con LLM
        analisis_llm = {}

        if criticas:
            console.print("\n[bold red]Analizando casos CRÍTICOS con LLM...[/bold red]")
            analisis_llm["criticos"] = self._analyze_with_llm(criticas, RiskLevel.CRITICO)

        if altas and len(altas) <= 20:  # Solo si no son muchos
            console.print("\n[bold yellow]Screening casos ALTOS con LLM...[/bold yellow]")
            analisis_llm["altos"] = self._analyze_with_llm(altas, RiskLevel.ALTO)

        # 6. Generar respuesta conversacional
        respuesta = self._build_conversational_output(
            total=len(disposiciones),
            anomalias={
                "criticas": criticas,
                "altas": altas,
                "medias": medias
            },
            analisis_llm=analisis_llm,
            periodo_dias=dias_atras
        )

        # 7. Guardar log
        self._save_log({
            "timestamp": datetime.now().isoformat(),
            "periodo_dias": dias_atras,
            "total_disposiciones": len(disposiciones),
            "total_anomalias": len(anomalias),
            "criticas": len(criticas),
            "altas": len(altas),
            "medias": len(medias),
            "analisis_llm": analisis_llm
        })

        return {
            "total": len(disposiciones),
            "anomalias": anomalias,
            "analisis": analisis_llm,
            "respuesta_conversacional": respuesta
        }

    def _analyze_with_llm(
        self,
        disposiciones: List[Dict[str, Any]],
        nivel: RiskLevel
    ) -> Optional[Dict[str, Any]]:
        """Analiza disposiciones con el LLM apropiado"""

        if not disposiciones:
            return None

        # Tomar score más alto para decisión de modelo
        max_score = max(d["risk_score"] for d in disposiciones)
        max_flags = max(d["num_flags"] for d in disposiciones)

        # Decidir modelo
        modelo = self.llm_router.decide_model(max_score, max_flags)

        if modelo is None:
            console.print("[dim]Análisis LLM omitido por configuración.[/dim]")
            return None

        try:
            if modelo == "claude":
                console.print("[blue]Usando Claude Opus 4.6...[/blue]")
                return self.llm_router.analyze_with_claude(disposiciones)
            else:  # gemini
                console.print("[blue]Usando Gemini 2.5 Flash...[/blue]")
                return self.llm_router.analyze_with_gemini(disposiciones)
        except Exception as e:
            console.print(f"[red]Error en análisis LLM: {str(e)}[/red]")
            return None

    def _print_summary_table(
        self,
        total: int,
        criticas: List,
        altas: List,
        medias: List
    ):
        """Imprime tabla resumen de anomalías"""
        table = Table(title="Resumen de Anomalías")
        table.add_column("Nivel", style="cyan")
        table.add_column("Cantidad", style="magenta")
        table.add_column("% del Total", style="green")

        table.add_row("🔴 CRÍTICO", str(len(criticas)), f"{len(criticas)/total*100:.1f}%")
        table.add_row("🟡 ALTO", str(len(altas)), f"{len(altas)/total*100:.1f}%")
        table.add_row("🟠 MEDIO", str(len(medias)), f"{len(medias)/total*100:.1f}%")
        table.add_row("TOTAL", str(len(criticas)+len(altas)+len(medias)), f"{(len(criticas)+len(altas)+len(medias))/total*100:.1f}%")

        console.print(table)

    def _build_conversational_output(
        self,
        total: int,
        anomalias: Dict[str, List],
        analisis_llm: Dict[str, Any],
        periodo_dias: int
    ) -> str:
        """Construye respuesta conversacional final"""

        criticas = anomalias["criticas"]
        altas = anomalias["altas"]
        medias = anomalias["medias"]

        output = f"\nAnalicé {total} disposiciones (últimos {periodo_dias} días).\n\n"

        # Sección críticas
        if criticas:
            output += f"🔴 **{len(criticas)} ALERTA(S) CRÍTICA(S)**\n\n"
            if "criticos" in analisis_llm and analisis_llm["criticos"]:
                output += build_conversational_response(
                    analisis_llm["criticos"],
                    "CRÍTICO"
                )
            else:
                # Listado simple sin LLM
                for c in criticas[:3]:  # Top 3
                    output += f"- Score {c['risk_score']}: {c['patron_sospechoso']}\n"
                    output += f"  Banderas: {', '.join([f['name'] for f in c['active_flags']])}\n"

        # Sección altas
        if altas:
            output += f"\n🟡 **{len(altas)} caso(s) de riesgo ALTO**\n"
            if "altos" in analisis_llm and analisis_llm["altos"]:
                output += build_conversational_response(
                    analisis_llm["altos"],
                    "ALTO"
                )
            else:
                output += f"Requieren atención en próximas 24-48 horas.\n"

        # Sección medias
        if medias:
            output += f"\n🟢 {len(medias)} caso(s) de riesgo MEDIO en monitoreo.\n"

        output += "\n" + "="*60 + "\n"
        output += "\n¿Deseas que profundice en algún caso específico o que analice el histórico de alguna sucursal/empleado?\n"

        return output

    def _save_log(self, data: Dict[str, Any]):
        """Guarda log del análisis"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = self.config.LOGS_DIR / f"analisis_{timestamp}.json"

        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    """Entry point para testing"""
    analyzer = PredictiveAnalyzer()

    # Análisis de últimos 3 días
    resultado = analyzer.analyze_periodo(dias_atras=3)

    # Imprimir respuesta conversacional
    if "respuesta_conversacional" in resultado:
        console.print(Panel(
            resultado["respuesta_conversacional"],
            title="Análisis Predictivo - Agent_disp_BQ",
            border_style="blue"
        ))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add analyzer.py
git commit -m "feat(agent-disp-bq): agregar analyzer principal

- Orquestador completo pipeline predictivo
- Integracion BigQuery + Scoring + LLM Router
- Salida conversacional formateada
- Logging de analisis
- CLI entry point para testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Query SQL Base

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\queries\base_disposiciones.sql`

- [ ] **Step 1: Crear query SQL base con scoring integrado**

```sql
-- Query base de disposiciones con scoring de riesgos integrado
-- Parámetros: {dias_atras} (default: 15)

WITH HGB AS (
  SELECT
    *,
    CASE
      WHEN sucursal_caja != sucursal THEN 'Validar'
    END AS evento_validar,
    CASE
      WHEN sucursal_caja = 43 AND id_caja = '79' THEN 671
      ELSE sucursal_caja
    END AS sucursal2
  FROM `ws-ctrol-interno.CAJA_UNICA.disposicion`
  WHERE DATE(fecha_contable) >= DATE_SUB(CURRENT_DATE(), INTERVAL {dias_atras} DAY)
    AND tipo_credito = 'REVOLVENTE'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY folio ORDER BY fecha_contable DESC
  ) = 1
),

D AS (
  SELECT
    uuid, codigo, tipo_operacion, contrato, monto, validado, caducado, fecha,
    tipo_envio, destino, fecha_validacion, created_date, update_date AS update__date,
    numero_cliente, estatus_destino, fecha_notificacion
  FROM `ws-ctrol-interno.CAJA_UNICA.validacion_otp`
),

P AS (
  SELECT numero_empleado, nombre_puesto, nombre_empleado
  FROM `ws-buro-clientes.DATA_OPERATIVA.plantilla_empleados`
),

EE AS (
  SELECT CAST(cliente AS STRING) AS CLIENT, CALIFICACION
  FROM `ws-buro-clientes.DATA.evolucion_diaria_clientes`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY cliente ORDER BY fecha_informacion DESC) = 1
),

QQ AS (
  SELECT
    empresa, fecha_informacion, id_linea_credito, contrato AS CONTRACTID, capital_insoluto,
    no_pagos_vencidos, dias_vencidos, saldo_vencido, monto_colocado, monto_dev_colocado,
    monto_revolvencia, monto_dev_revolvencia, monto_seguros, monto_dev_seguro, fecha_ult_mov,
    maximo_retraso, no_ult_pago, fecha_liquidacion, bandera_castigo, status, limite_credito,
    origen, propietario, tasa, monto_pago, efectivo_recuperado, fecha_prox_pago, fecha_ult_pago,
    devengado_por_pagar, cliente AS id_clients, efectivo_recuperado_diario, monto_bonificado_diario,
    no_pagos_vencidos_proy, monto_bonificado, no_pagos_vencidos_ini_proy, id_contrato_migrado,
    bandera_lc_activa_ini, bandera_lc_activa, dias_vencidos_iniciales
  FROM `ws-buro-clientes.DATA.evolucion_diaria_lineas_credito`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY contrato ORDER BY fecha_informacion DESC) = 1
),

RR AS (
  SELECT CLIENTE, CURP, RFC
  FROM `ws-buro-clientes.DATA.clientes`
),

TT AS (
  SELECT CLIENTE, FECHA_NACIMIENTO
  FROM `ws-buro-clientes.DATA.clientes_demograficos`
),

base_data AS (
  SELECT
    HGB.*,
    RR.CURP,
    RR.RFC,
    D.destino,
    D.validado,
    D.update__date,
    D.estatus_destino,
    P.numero_empleado,
    P.nombre_puesto,
    P.nombre_empleado,
    TT.FECHA_NACIMIENTO,
    EE.CLIENT,
    EE.CALIFICACION,
    QQ.*
  FROM HGB

  LEFT JOIN D
    ON HGB.uuid_codigo_validacion = D.uuid

  LEFT JOIN P
    ON HGB.usuario_op = P.numero_empleado

  LEFT JOIN EE
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(D.NUMERO_CLIENTE, r'[^0-9]', '') AS INT64)

  LEFT JOIN QQ
    ON SAFE_CAST(REGEXP_REPLACE(HGB.CONTRATO, r'[^0-9]', '') AS INT64)
       IN (QQ.CONTRACTID, QQ.id_contrato_migrado)

  LEFT JOIN RR
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(CAST(RR.CLIENTE AS STRING), r'[^0-9]', '') AS INT64)

  LEFT JOIN TT
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(CAST(TT.CLIENTE AS STRING), r'[^0-9]', '') AS INT64)
)

-- Nota: Las columnas de banderas vienen del sheet bd_disp
-- El scoring en Python usa estas columnas para calcular risk_score
SELECT * FROM base_data
ORDER BY fecha_contable DESC
LIMIT 500
```

- [ ] **Step 2: Commit**

```bash
git add queries/base_disposiciones.sql
git commit -m "feat(agent-disp-bq): agregar query SQL base disposiciones

- Query completa del usuario con CTEs
- Parametro dias_atras configurable
- Joins con validacion OTP, empleados, clientes
- Limit 500 para performance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Actualizar Agent_disp_BQ.md

**Files:**
- Modify: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ.md`

- [ ] **Step 1: Leer agente actual**

```bash
cd C:\Users\Administrador\.claude\agents
cat Agent_disp_BQ.md | head -50
```

- [ ] **Step 2: Actualizar Agent_disp_BQ.md con modo dual**

Agregar al inicio del archivo (después del frontmatter):

```markdown
# Agent_disp_BQ - Analista Dual: Operativo + Predictivo

Eres un agente analista de datos BigQuery para FINDEP con dos modos de operación.

## Modos de Operación

### MODO 1: Operativo (consultas ad-hoc)
Cuando el usuario pide datos específicos sin análisis predictivo:
- "Disposiciones de la sucursal 127 última semana"
- "Historial del contrato CTR-12345"
- "Top 10 sucursales por monto"

**Acción:** Ejecutar query BigQuery y presentar resultados tabulares (comportamiento actual).

### MODO 2: Predictivo (detección de anomalías)
Cuando el usuario pide análisis de riesgos/fraudes:
- "Analiza disposiciones últimos 3 días"
- "¿Hay algo atípico en la sucursal 127?"
- "Briefing de riesgos"
- "Detecta fraudes últimos 7 días"

**Acción:**
1. Ejecutar query BigQuery con datos enriquecidos
2. Calcular scoring de riesgos (13 banderas)
3. Categorizar anomalías (crítico/alto/medio/bajo)
4. Análisis con LLM híbrido:
   - Score ≥80: Claude Opus 4.6 (análisis forense profundo)
   - Score 40-79: Gemini 2.5 Flash (screening rápido)
   - Score <40: Solo métricas, sin LLM
5. Presentar respuesta conversacional ejecutiva

## Detección Automática de Modo

```python
# El agente detecta el modo basándose en keywords
keywords_predictivo = [
    "analiza", "analizar", "anomalías", "atípico", "riesgo", "fraude",
    "briefing", "alerta", "patrón", "sospechoso", "detecta", "predice"
]

if any(kw in user_query.lower() for kw in keywords_predictivo):
    modo = "PREDICTIVO"
    # Ejecutar: python -m analyzer --query "{user_query}"
else:
    modo = "OPERATIVO"
    # Comportamiento actual: query BigQuery directo
```

## Sistema de Scoring de Riesgos (Modo Predictivo)

Basado en 13 banderas detectadas automáticamente:

| Bandera | Puntos | Categoría |
|---------|--------|-----------|
| Tel de Colaborador | 35 | Crítico |
| Contratos <3min | 35 | Crítico |
| Pago SPEI Colab | 40 | Crítico |
| Monto duplicado | 30 | Crítico |
| +1 mismo día | 25 | Alto |
| Fuera horario | 20 | Alto |
| Foráneas efectivo | 20 | Alto |
| Tel repetido | 25 | Alto |
| En quincena | 10 | Medio |
| Calificación ≤5 | 15 | Medio |
| >120 días | 15 | Medio |
| Disp >1K | 10 | Bajo |
| Disp >24K | 12 | Bajo |

**Umbrales de categorización:**
- Score ≥80 o 3+ banderas: **CRÍTICO** (requiere Claude Opus 4.6)
- Score ≥40 o 2+ banderas: **ALTO** (Gemini 2.5 Flash)
- Score ≥20: **MEDIO** (Gemini o solo métricas)
- Score <20: **BAJO** (solo registro estadístico)

## Motor Híbrido LLM

**Claude Opus 4.6** (casos críticos):
- Análisis forense completo
- Identificación de mecánica del fraude
- Recomendaciones ejecutivas
- Controles preventivos
- Costo: ~$0.25/análisis

**Gemini 2.5 Flash** (screening):
- Detección rápida de patrones
- Priorización de casos
- Alertas operativas
- Costo: ~$0.02/análisis

## Ejecución Modo Predictivo

```bash
# Desde Agent_disp_BQ resources directory
cd ~/.claude/agents/Agent_disp_BQ_resources

# Crear .env con API keys (primera vez)
cp .env.example .env
# Editar .env con: ANTHROPIC_API_KEY, GEMINI_API_KEY

# Ejecutar análisis
python analyzer.py  # Por defecto: últimos 3 días

# O desde cualquier lugar (si PATH configurado)
python -m agent_disp_bq_resources.analyzer
```

## Configuración (Agent_disp_BQ_resources/.env)

```bash
# BigQuery (ya configurado con gcloud)
BQ_PROJECT_ID=ws-ctrol-interno
BQ_LOCATION=US

# Claude API (obtener de https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# Gemini API (obtener de https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=...

# Control de presupuesto
FORCE_GEMINI_ONLY=false           # true = nunca usar Claude (ahorro)
MAX_CLAUDE_CALLS_PER_MONTH=20     # Límite mensual
CONFIRM_BEFORE_CLAUDE=true        # Pedir confirmación antes de Claude
```

## Ejemplos de Uso

### Modo Operativo (actual, sin cambios)
```
Usuario: "Agent_disp_BQ disposiciones sucursal 127 última semana"

Agent: [Ejecuta query BigQuery directo]
| Fecha | Contrato | Monto | Tipo | Empleado |
|-------|----------|-------|------|----------|
| ...   | ...      | ...   | ...  | ...      |

Total: 49 disposiciones, $847,300 MXN
```

### Modo Predictivo (nuevo)
```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 3 días"

Agent: [Pipeline completo]
1. Query BigQuery (847 disposiciones)
2. Scoring (23 anomalías detectadas)
3. Categorización (2 críticas, 8 altas, 13 medias)
4. Análisis LLM híbrido
5. Respuesta conversacional:

🔴 ALERTA CRÍTICA - Colusión empleado-cliente

Empleado #4521 (Sucursal 127) procesó 8 disposiciones en 14 minutos.
Todos los clientes comparten teléfono registrado.
Impacto: $127,400 MXN

ACCIONES INMEDIATAS:
1. ⏱️ AHORA: Bloquear operaciones empleado #4521
2. ⏱️ 2 horas: Revisar video vigilancia...

¿Deseas que profundice en este caso?
```

## Recursos Externos

- **Código:** `~/.claude/agents/Agent_disp_BQ_resources/`
- **Spec:** `docs/superpowers/specs/2026-03-28-agent-disp-bq-predictive-design.md`
- **BigQuery:** ws-ctrol-interno.CAJA_UNICA.disposicion
- **Claude API:** Anthropic (claude-opus-4-6)
- **Gemini API:** Google AI Studio (gemini-2.5-flash)

## Reglas Estrictas

1. NUNCA expongas PII (nombres clientes, teléfonos completos, CURP, RFC)
2. SIEMPRE usa --location=US en queries BigQuery
3. Responde en español con tono ejecutivo
4. Sin emojis en reportes formales (solo en conversación)
5. Basado en evidencia, orientado a decisiones
6. Logs de todos los análisis en Agent_disp_BQ_resources/logs/
```

- [ ] **Step 3: Commit**

```bash
git add Agent_disp_BQ.md
git commit -m "feat(agent-disp-bq): actualizar agente con modo dual

- Documentacion modo operativo vs predictivo
- Deteccion automatica de modo por keywords
- Sistema de scoring explicado
- Motor hibrido LLM documentado
- Ejemplos de uso
- Configuracion y recursos

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Testing Integración

**Files:**
- Modify: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\.env` (crear desde .env.example)

- [ ] **Step 1: Configurar .env con API keys reales**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources

# Copiar template
cp .env.example .env

# Editar .env (usuario debe poner sus API keys)
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
```

Esperar confirmación del usuario que tiene las API keys configuradas.

- [ ] **Step 2: Test de imports**

```bash
cd C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources
python -c "
from config import get_config
from bigquery_client import BigQueryClient
from risk_scoring import RiskScorer
from llm_router import LLMRouter
from analyzer import PredictiveAnalyzer
print('✓ Todos los imports OK')
"
```

Expected: `✓ Todos los imports OK`

- [ ] **Step 3: Test de configuración**

```bash
python -c "
from config import get_config
config = get_config()
print(f'BQ Project: {config.BQ_PROJECT_ID}')
print(f'BQ Location: {config.BQ_LOCATION}')
print(f'Claude Model: {config.CLAUDE_MODEL}')
print(f'Gemini Model: {config.GEMINI_MODEL}')
print('✓ Configuración OK')
"
```

Expected output:
```
BQ Project: ws-ctrol-interno
BQ Location: US
Claude Model: claude-opus-4-6
Gemini Model: gemini-2.0-flash-exp
✓ Configuración OK
```

- [ ] **Step 4: Test scoring con datos sintéticos**

```bash
python -c "
from risk_scoring import RiskScorer

scorer = RiskScorer()

# Caso crítico
disp_critica = {
    '| Tel de Colaborador |': 'X',
    '| Pago SPEI Colab |': 'X',
    '| +1 mismo día |': 'X'
}

result = scorer.calculate_score(disp_critica)
print(f'Score: {result[\"risk_score\"]}')
print(f'Level: {result[\"risk_level\"]}')
print(f'Flags: {result[\"num_flags\"]}')
print(f'Pattern: {result[\"patron_sospechoso\"]}')

assert result['risk_level'] == 'CRÍTICO'
print('✓ Scoring test OK')
"
```

Expected: Score alto, Level CRÍTICO

- [ ] **Step 5: Test BigQuery conexión (dry run)**

```bash
python -c "
from bigquery_client import BigQueryClient

client = BigQueryClient()

# Test query simple
test_query = '''
SELECT COUNT(*) as total
FROM \`ws-ctrol-interno.CAJA_UNICA.disposicion\`
WHERE DATE(fecha_contable) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
'''

# Dry run (no ejecuta, solo valida)
estimate = client.get_query_cost_estimate(test_query)
print(f'Bytes a procesar: {estimate[\"bytes_processed_mb\"]} MB')
print(f'Costo estimado: ${estimate[\"cost_usd\"]:.6f} USD')
print('✓ BigQuery conexión OK')
"
```

Expected: Bytes procesados y costo estimado mostrados

- [ ] **Step 6: Test COMPLETO con datos reales (opcional - si usuario aprueba)**

**IMPORTANTE:** Este paso ejecuta query BigQuery real y puede consumir API keys de LLM.

```bash
# Solo ejecutar si usuario confirma
python analyzer.py
```

Expected:
- Query ejecutada
- Disposiciones obtenidas
- Scoring calculado
- Si hay anomalías críticas: análisis con LLM
- Respuesta conversacional impresa

- [ ] **Step 7: Verificar logs generados**

```bash
ls -lh logs/
cat logs/usage_monthly.json  # Ver tracking de uso
```

Expected: Archivos de log creados

- [ ] **Step 8: Commit (si tests pasan)**

```bash
git add .env  # Solo si no está en .gitignore (debería estarlo)
# Crear .gitignore si no existe
echo ".env" > .gitignore
echo "logs/*.json" >> .gitignore
echo "__pycache__/" >> .gitignore
echo "*.pyc" >> .gitignore

git add .gitignore
git commit -m "test(agent-disp-bq): verificar integracion completa

- Tests de imports OK
- Tests de configuracion OK
- Tests de scoring OK
- Tests de BigQuery conexion OK
- Gitignore para archivos sensibles

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Documentación Final

**Files:**
- Create: `C:\Users\Administrador\.claude\agents\Agent_disp_BQ_resources\README.md`

- [ ] **Step 1: Crear README.md**

```markdown
# Agent_disp_BQ - Recursos del Sistema Predictivo

Sistema de detección predictiva de fraudes en disposiciones usando motor híbrido Gemini/Claude.

## Instalación

```bash
cd ~/.claude/agents/Agent_disp_BQ_resources

# Instalar dependencias
pip install -r requirements.txt

# Configurar API keys
cp .env.example .env
# Editar .env con tus API keys
```

## Configuración

Edita `.env` con tus credenciales:

```bash
# Claude API (https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# Gemini API (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=...

# BigQuery (ya configurado con gcloud)
BQ_PROJECT_ID=ws-ctrol-interno
BQ_LOCATION=US
```

## Uso

### Modo Básico

```bash
python analyzer.py
```

Analiza últimos 3 días por defecto.

### Desde Claude Code

```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 7 días"
```

El agente detecta automáticamente modo predictivo y ejecuta el pipeline completo.

## Arquitectura

```
analyzer.py (orquestador)
    ↓
bigquery_client.py → Query BigQuery
    ↓
risk_scoring.py → Calcular scores
    ↓
llm_router.py → Decidir Claude vs Gemini
    ↓
prompts.py → Generar análisis
    ↓
Respuesta conversacional
```

## Componentes

- **config.py**: Configuración con Pydantic
- **bigquery_client.py**: Cliente BigQuery
- **risk_scoring.py**: Sistema de scoring (13 banderas)
- **llm_router.py**: Router híbrido Claude/Gemini
- **prompts.py**: Templates de prompts
- **analyzer.py**: Orquestador principal

## Queries SQL

- `queries/base_disposiciones.sql`: Query principal con scoring
- Parámetros: `{dias_atras}` (default: 15)

## Logs

- `logs/analisis_YYYYMMDD_HHMMSS.json`: Log de cada análisis
- `logs/usage_monthly.json`: Tracking de uso de LLMs

## Costos

- **Gemini 2.5 Flash**: ~$0.02/análisis
- **Claude Opus 4.6**: ~$0.25/análisis
- **BigQuery**: ~$0.0001/query (bajo free tier)

**Total estimado**: $0-10/mes según uso

## Control de Presupuesto

En `.env`:

```bash
FORCE_GEMINI_ONLY=true            # Nunca usar Claude (ahorro)
MAX_CLAUDE_CALLS_PER_MONTH=20     # Límite mensual Claude
CONFIRM_BEFORE_CLAUDE=true        # Pedir confirmación antes Claude
```

## Testing

```bash
# Test imports
python -c "from analyzer import PredictiveAnalyzer; print('OK')"

# Test scoring
python -c "from risk_scoring import RiskScorer; s=RiskScorer(); print('OK')"

# Test completo (requiere .env configurado)
python analyzer.py
```

## Troubleshooting

**Error: ANTHROPIC_API_KEY field required**
- Configura `.env` con tu API key de Claude

**Error: GEMINI_API_KEY field required**
- Configura `.env` con tu API key de Gemini

**Error: BigQuery access denied**
- Verifica `gcloud auth application-default login`
- Verifica proyecto: `gcloud config get-value project`

**Error: No module named 'anthropic'**
- Instala dependencias: `pip install -r requirements.txt`

## Recursos

- **Spec**: `docs/superpowers/specs/2026-03-28-agent-disp-bq-predictive-design.md`
- **Plan**: `docs/superpowers/plans/2026-03-28-agent-disp-bq-predictive.md`
- **Agente**: `~/.claude/agents/Agent_disp_BQ.md`

## Soporte

- Documentación completa en spec
- Issues: Reportar en repositorio principal
```

- [ ] **Step 2: Commit final**

```bash
git add README.md
git commit -m "docs(agent-disp-bq): agregar README completo

- Instalacion y configuracion
- Guia de uso
- Arquitectura documentada
- Troubleshooting
- Control de costos

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Verificación Final

Antes de declarar Fase 1 completa, verifica:

- [ ] **Estructura de archivos**: Todos los archivos creados en sus rutas correctas
- [ ] **Dependencies**: `pip install -r requirements.txt` ejecutado sin errores
- [ ] **Configuration**: `.env` configurado con API keys del usuario
- [ ] **Imports**: Todos los módulos se importan sin errores
- [ ] **BigQuery**: Conexión verificada (dry run exitoso)
- [ ] **Scoring**: Tests unitarios pasando
- [ ] **Agent actualizado**: `Agent_disp_BQ.md` tiene documentación de modo dual
- [ ] **Commits**: Todos los cambios commiteados
- [ ] **Docs**: README.md y spec completos

---

**Fase 1 COMPLETA** ✅

El sistema está listo para uso. Próximos pasos opcionales:

- **Fase 2**: Sistema RAG con knowledge base (2-3 sesiones adicionales)
- **Optimización**: Ajustar umbrales basado en feedback real
- **Queries adicionales**: Añadir queries parametrizadas por empleado, sucursal, contrato

---
