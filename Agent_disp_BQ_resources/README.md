# Agent_disp_BQ - Sistema Predictivo de Detección de Fraudes

Sistema de detección predictiva de fraudes en disposiciones usando motor híbrido Gemini/Claude con scoring automático de riesgos.

## Arquitectura

```
Usuario → Agent_disp_BQ.md (modo dual)
            ↓
        analyzer.py (orquestador)
            ↓
    ┌───────────────┴───────────────┐
    │                               │
bigquery_client.py         risk_scoring.py
    │ (ejecuta query)        │ (13 banderas)
    ↓                        ↓
    └──────────┬─────────────┘
               ↓
        llm_router.py (decide Claude vs Gemini)
               ↓
    ┌──────────┴──────────┐
    │                     │
Claude Opus 4.6    Gemini 2.5 Flash
(análisis forense)  (screening rápido)
    │                     │
    └──────────┬──────────┘
               ↓
     prompts.py (formateo conversacional)
               ↓
          Respuesta final
```

## Instalación

```bash
cd Agent_disp_BQ_resources

# Instalar dependencias
pip install -r requirements.txt

# Configurar API keys
cp .env.example .env
# Editar .env con tus API keys (ver sección Configuración)
```

## Configuración

### Configuración Actual (Solo Gemini)

El sistema está **100% funcional con Gemini 2.5 Flash** (sin costo).

**Claude Opus 4.6 es OPCIONAL** - Ver `COMO_AGREGAR_CLAUDE.md` para instrucciones.

Estado actual de `Agent_disp_BQ_resources/.env`:

```bash
# BigQuery (configurado)
BQ_PROJECT_ID=ws-ctrol-interno
BQ_LOCATION=US

# Gemini API (CONFIGURADA Y LISTA)
GEMINI_API_KEY=AIzaSyD... ✓

# Claude API (OPCIONAL - Agregar después si se necesita)
ANTHROPIC_API_KEY=sk-ant-PENDIENTE... (ejecutar setup_claude_key.py)

# Modo de operación
FORCE_GEMINI_ONLY=true  # Solo Gemini por ahora
MAX_CLAUDE_CALLS_PER_MONTH=20
CONFIRM_BEFORE_CLAUDE=true

# Umbrales
CRITICAL_THRESHOLD=80
HIGH_THRESHOLD=40
```

**Para agregar Claude después:**
```bash
python setup_claude_key.py
# O leer: Agent_disp_BQ_resources/COMO_AGREGAR_CLAUDE.md
```

## Uso

### Desde Claude Code (recomendado)

```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 3 días"
```

El agente detecta automáticamente modo predictivo y ejecuta el pipeline completo.

### Modo CLI directo

```bash
cd Agent_disp_BQ_resources
python analyzer.py  # Analiza últimos 3 días por defecto
```

## Componentes

| Archivo | Función |
|---------|---------|
| `config.py` | Configuración con Pydantic Settings |
| `bigquery_client.py` | Cliente BigQuery con dry run y retry |
| `risk_scoring.py` | Sistema de scoring (13 banderas) |
| `llm_router.py` | Router híbrido Claude/Gemini con tracking costos |
| `prompts.py` | Templates de prompts LLM |
| `analyzer.py` | Orquestador principal |
| `queries/base_disposiciones.sql` | Query BigQuery con CTEs |

## Sistema de Scoring

### 13 Banderas de Riesgo

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

### Categorización Automática

- **Score ≥80 o 3+ banderas:** CRÍTICO → Claude Opus 4.6
- **Score ≥40 o 2+ banderas:** ALTO → Gemini 2.5 Flash
- **Score ≥20:** MEDIO → Gemini o solo métricas
- **Score <20:** BAJO → Solo registro estadístico

### Multiplicadores

- 2+ flags activas: x1.5
- Mismo empleado múltiples flags: x2.0
- Sucursal con patrón repetido: x1.8
- Cluster temporal: x1.6

## Motor Híbrido LLM

### Claude Opus 4.6 (casos críticos)

**Cuándo:** Score ≥80, casos de fraude confirmados
**Qué hace:**
- Análisis forense completo
- Identificación de mecánica del fraude
- Cuantificación de impacto financiero
- Recomendaciones ejecutivas
- Controles preventivos

**Costo:** ~$0.25/análisis

### Gemini 2.5 Flash (screening)

**Cuándo:** Score 40-79, casos sospechosos
**Qué hace:**
- Detección rápida de patrones
- Priorización de casos
- Alertas operativas
- Tendencias del periodo

**Costo:** ~$0.02/análisis (free tier: 15 RPM)

## Costos Estimados

| Componente | Costo |
|------------|-------|
| BigQuery query | ~$0.0001/query (bajo free tier) |
| Gemini 2.5 Flash | ~$0.02/análisis |
| Claude Opus 4.6 | ~$0.25/análisis |
| **Total mensual** | **$0-10** (según uso) |

**Tracking automático:** Ver `logs/usage_monthly.json`

## Testing

### Test de imports
```bash
python -c "from analyzer import PredictiveAnalyzer; print('OK')"
```

### Test de scoring
```bash
python -c "from risk_scoring import RiskScorer; s=RiskScorer(); print('OK')"
```

### Test completo (requiere .env configurado)
```bash
python analyzer.py
```

## Logs

- `logs/analisis_YYYYMMDD_HHMMSS.json`: Log de cada análisis
- `logs/usage_monthly.json`: Tracking de uso de LLMs y costos

Ejemplo `usage_monthly.json`:
```json
{
  "2026-03": {
    "claude_calls": 5,
    "claude_cost_usd": 1.25,
    "gemini_calls": 12,
    "gemini_cost_usd": 0.24,
    "total_cost_usd": 1.49
  }
}
```

## Troubleshooting

### Error: ANTHROPIC_API_KEY field required
Solución: Configura `.env` con tu API key de Claude
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Error: GEMINI_API_KEY field required
Solución: Configura `.env` con tu API key de Gemini
```bash
GEMINI_API_KEY=AIza...
```

### Error: BigQuery access denied
Soluciones:
```bash
# 1. Login
gcloud auth application-default login

# 2. Verificar proyecto
gcloud config get-value project

# 3. Set proyecto
gcloud config set project ws-ctrol-interno
```

### Error: No module named 'anthropic'
Solución:
```bash
pip install -r requirements.txt
```

### Encoding issues en Windows
Los acentos pueden verse mal en la consola de Windows (ej: "CRÍTICO" → "CR�TICO"). Esto es solo un problema de display, el código funciona correctamente.

## Recursos

- **Spec completo:** `docs/superpowers/specs/2026-03-28-agent-disp-bq-predictive-design.md`
- **Plan de implementación:** `docs/superpowers/plans/2026-03-28-agent-disp-bq-predictive.md`
- **Agente global:** `~/.claude/agents/Agent_disp_BQ.md`

## Seguridad

⚠️ **NUNCA** commitear el archivo `.env` (contiene API keys)
✅ `.gitignore` ya está configurado para proteger archivos sensibles

## Soporte

Para issues o mejoras, contactar al equipo de Auditoría Interna / Control Interno FINDEP.

---

**Version:** 1.0.0
**Última actualización:** 2026-03-29
**Autor:** Heriberto Galvez (hgalvezb@findep.com.mx)
**Stack:** Python 3.11, BigQuery, Claude API, Gemini API
