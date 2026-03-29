# Agent_disp_BQ - Modalidad Predictiva con IA Híbrida

**Fecha:** 2026-03-28
**Autor:** Hugo Gálvez (hgalvezb@findep.com.mx)
**Estado:** Aprobado para implementación
**Fases:** Fase 1 (Motor Híbrido) + Fase 2 (RAG)

---

## Resumen Ejecutivo

Expandir Agent_disp_BQ con capacidades predictivas de detección de fraudes y análisis de riesgos usando arquitectura híbrida de LLMs (Gemini 2.5 Flash + Claude Opus 4.6) y sistema RAG para memoria institucional.

**Valor de negocio:**
- Detección proactiva de fraudes (vs. reactiva)
- Reducción estimada 40% en pérdidas por fraude (benchmark McKinsey)
- Tiempo de investigación: de días a minutos
- Memoria institucional: aprendizaje continuo de casos históricos

**Inversión:**
- Desarrollo: 2-3 semanas
- Costo operativo: $0-10/mes (variable por uso)
- Infraestructura adicional: $0

---

## 1. Objetivos y Alcance

### 1.1 Objetivos

**Primarios:**
1. Detectar automáticamente patrones de fraude en disposiciones
2. Categorizar riesgos (crítico/alto/medio/bajo) con scoring objetivo
3. Proporcionar análisis conversacional ejecutivo orientado a decisiones
4. Aprender de casos históricos (memoria institucional)

**Secundarios:**
5. Reducir tiempo de investigación de fraudes (días → minutos)
6. Estandarizar metodología de análisis de riesgos
7. Documentar conocimiento institucional de fraudes

### 1.2 Alcance

**En Scope - Fase 1:**
- ✅ Modo dual (operativo + predictivo)
- ✅ Sistema de scoring automático (13 banderas de riesgo)
- ✅ Motor híbrido LLM (Gemini/Claude)
- ✅ Análisis conversacional bajo demanda
- ✅ Queries SQL parametrizadas (empleado, sucursal, contrato)

**En Scope - Fase 2:**
- ✅ Sistema RAG con embeddings
- ✅ Base de conocimiento de fraudes históricos
- ✅ Búsqueda semántica de casos similares
- ✅ Enriquecimiento de análisis con contexto histórico

**Out of Scope:**
- ❌ Notificaciones automáticas (solo invocación manual)
- ❌ Integración con Daily AI Coach (futuro)
- ❌ Acciones automáticas (bloqueos, alertas operativas)
- ❌ Dashboard visual (solo conversacional)
- ❌ Entrenamiento de modelos ML propios

### 1.3 Principios de Diseño

1. **Bajo demanda:** Solo actúa cuando usuario invoca al agente
2. **Explicabilidad:** Análisis basados en evidencia, razonamiento transparente
3. **Costo consciente:** Decisión inteligente Gemini (económico) vs Claude (profundo)
4. **Privacidad:** Nunca exponer PII en respuestas
5. **Evolutivo:** Mejora continua con cada fraude confirmado

---

## 2. Arquitectura General

### 2.1 Vista de Alto Nivel

```
Usuario en Claude Code
        ↓
    [Invoca Agent_disp_BQ con prompt]
        ↓
    Detección de Modo
    ├── OPERATIVO → Query BigQuery directo → Resultado tabular
    └── PREDICTIVO → Pipeline análisis ↓

Pipeline Predictivo:
    1. BigQuery Query (SQL con scoring)
    2. Categorización de Anomalías
    3. Decisión Motor LLM
       ├── Score ≥80 → Claude Opus 4.6 (análisis forense)
       └── Score 40-79 → Gemini 2.5 Flash (screening)
    4. RAG (Fase 2): Búsqueda casos históricos
    5. Generación Respuesta Conversacional
```

### 2.2 Componentes del Sistema

```
Agent_disp_BQ_resources/
├── analyzer.py              # Orquestador principal
├── bigquery_client.py       # Cliente BigQuery
├── risk_scoring.py          # Motor de scoring
├── llm_router.py            # Decisión Gemini vs Claude
├── prompts.py               # Templates prompts
├── rag_engine.py            # Motor RAG (Fase 2)
├── config.py                # Configuración
├── queries/                 # SQL templates
│   ├── base_disposiciones.sql
│   ├── analisis_empleado.sql
│   ├── analisis_sucursal.sql
│   └── analisis_contrato.sql
├── knowledge_base/          # RAG (Fase 2)
│   ├── fraudes_confirmados.json
│   ├── controles.json
│   └── embeddings_cache/
└── logs/                    # Logs de análisis
```

---

## 3. Sistema de Scoring de Riesgos

### 3.1 Banderas de Riesgo

Basadas en las columnas del sheet `bd_disp`:

| Bandera | Columna Original | Puntos | Categoría |
|---------|------------------|--------|-----------|
| Tel de Colaborador | `\| Tel de Colaborador \|` | 35 | Crítico |
| Contratos <3min | `\| != contratos en menos de 3 min \|` | 35 | Crítico |
| Pago SPEI Colab | `\| Pago SPEI Colab \|` | 40 | Crítico |
| Monto duplicado | `\| Monto duplicado mismo día \|` | 30 | Crítico |
| +1 mismo día | `\| +1 mismo día \|` | 25 | Alto |
| Fuera horario | `\| fuera de horario \|` | 20 | Alto |
| Foráneas efectivo | `\| Foraneas_en_efectivo \|` | 20 | Alto |
| Tel repetido | `\| Tel repetido distintos contratos \|` | 25 | Alto |
| En quincena | `\| en Quincena \|` | 10 | Medio |
| Calificación ≤5 | `\| Calificación <= 5 \|` | 15 | Medio |
| >120 días | `\| > 120 días \|` | 15 | Medio |
| Disp >1K | `Disp>1k C525` | 10 | Bajo |
| Disp >24K | `Disposiciones >24k` | 12 | Bajo |

### 3.2 Multiplicadores de Riesgo

```python
MULTIPLICADORES = {
    "multiple_flags": 1.5,        # 2+ flags → score × 1.5
    "empleado_repetido": 2.0,     # Mismo empleado múltiples flags
    "sucursal_patron": 1.8,       # Sucursal con patrón repetido
    "cluster_temporal": 1.6       # Múltiples casos mismo día
}
```

### 3.3 Umbrales de Categorización

```python
def categorizar_riesgo(score, num_flags):
    if score >= 80 or num_flags >= 3:
        return "CRÍTICO"    # Requiere Claude Opus 4.6
    elif score >= 40 or num_flags >= 2:
        return "ALTO"       # Gemini 2.5 Flash suficiente
    elif score >= 20:
        return "MEDIO"      # Gemini Flash o solo métricas
    else:
        return "BAJO"       # Solo registro estadístico
```

### 3.4 Query SQL con Scoring

```sql
-- Envuelve la query base del usuario en CTE con scoring
WITH base_data AS (
  -- Query completa proporcionada por el usuario (HGB, D, P, EE, QQ, RR, TT)
  SELECT
    *,
    CASE WHEN sucursal_caja != sucursal THEN 'Validar' END AS evento_validar,
    CASE WHEN sucursal_caja = 43 AND id_caja = '79' THEN 671 ELSE sucursal_caja END AS sucursal2
  FROM `ws-ctrol-interno.CAJA_UNICA.disposicion`
  WHERE DATE(fecha_contable) >= DATE_SUB(CURRENT_DATE(), INTERVAL 15 DAY)
    AND tipo_credito = 'REVOLVENTE'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY folio ORDER BY fecha_contable DESC) = 1
  -- [resto de CTEs: D, P, EE, QQ, RR, TT]
),

scoring AS (
  SELECT
    *,
    -- Calcular score de riesgo
    (
      CASE WHEN `| Tel de Colaborador |` IS NOT NULL THEN 35 ELSE 0 END +
      CASE WHEN `| != contratos en menos de 3 min |` IS NOT NULL THEN 35 ELSE 0 END +
      CASE WHEN `| Pago SPEI Colab |` IS NOT NULL THEN 40 ELSE 0 END +
      CASE WHEN `| Monto duplicado mismo día |` IS NOT NULL THEN 30 ELSE 0 END +
      CASE WHEN `| +1 mismo día |` IS NOT NULL THEN 25 ELSE 0 END +
      CASE WHEN `| fuera de horario |` IS NOT NULL THEN 20 ELSE 0 END +
      CASE WHEN `| Foraneas_en_efectivo |` IS NOT NULL THEN 20 ELSE 0 END +
      CASE WHEN `| Tel repetido distintos contratos |` IS NOT NULL THEN 25 ELSE 0 END +
      CASE WHEN `| en Quincena |` IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN `| Calificación <= 5 |` IS NOT NULL THEN 15 ELSE 0 END +
      CASE WHEN `| > 120 días |` IS NOT NULL THEN 15 ELSE 0 END +
      CASE WHEN `Disp>1k C525` IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN `Disposiciones >24k` IS NOT NULL THEN 12 ELSE 0 END
    ) AS risk_score,

    -- Contar flags activas
    (
      (CASE WHEN `| Tel de Colaborador |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| != contratos en menos de 3 min |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| Pago SPEI Colab |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| Monto duplicado mismo día |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| +1 mismo día |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| fuera de horario |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| Foraneas_en_efectivo |` IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN `| Tel repetido distintos contratos |` IS NOT NULL THEN 1 ELSE 0 END)
    ) AS num_flags,

    -- Identificar tipo de patrón dominante
    CASE
      WHEN `| Tel de Colaborador |` IS NOT NULL OR `| Pago SPEI Colab |` IS NOT NULL
        THEN 'Colusión empleado-cliente'
      WHEN `| != contratos en menos de 3 min |` IS NOT NULL OR `| +1 mismo día |` IS NOT NULL
        THEN 'Fraccionamiento'
      WHEN `| fuera de horario |` IS NOT NULL
        THEN 'Horario irregular'
      WHEN `| Tel repetido distintos contratos |` IS NOT NULL
        THEN 'Identidad sintética posible'
      ELSE 'Otro'
    END AS patron_sospechoso

  FROM base_data
)

SELECT * FROM scoring
WHERE risk_score > 0  -- Solo anomalías
ORDER BY risk_score DESC, fecha_contable DESC
LIMIT 500  -- Top 500 casos más riesgosos
```

---

## 4. Motor Híbrido de LLMs

### 4.1 Decisión de Routing

```python
def decidir_motor_llm(score, num_flags, presupuesto_config):
    """
    Decide qué motor LLM usar basándose en score y configuración
    """
    # Opción 1: Forzar solo Gemini (configuración de ahorro)
    if presupuesto_config.get("FORCE_GEMINI_ONLY"):
        return "gemini-2.5-flash"

    # Opción 2: Routing inteligente por score
    if score >= 80 or num_flags >= 3:
        # Verificar límite mensual de Claude
        if presupuesto_config.get("claude_calls_this_month", 0) >= presupuesto_config.get("MAX_CLAUDE_CALLS_PER_MONTH", 999):
            return "gemini-2.5-flash"  # Fallback a Gemini

        # Opción 3: Pedir confirmación al usuario
        if presupuesto_config.get("CONFIRM_BEFORE_CLAUDE"):
            confirmar = input(f"Detecté {num_flags} anomalías críticas (score={score}).\n"
                            f"Análisis con Claude Opus 4.6 (costo ~$0.25).\n"
                            f"¿Proceder? [C]laude / [G]emini / [S]kip: ")
            if confirmar.upper() == 'C':
                return "claude-opus-4.6"
            elif confirmar.upper() == 'G':
                return "gemini-2.5-flash"
            else:
                return None  # Skip análisis LLM

        return "claude-opus-4.6"

    elif score >= 40:
        return "gemini-2.5-flash"

    else:
        return None  # Solo métricas, sin LLM
```

### 4.2 Prompts

#### Contexto Base (Compartido)

```python
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
```

#### Prompt Claude Opus 4.6 (Casos Críticos)

```python
CLAUDE_PROMPT_CRITICAL = f"""
{FINDEP_CONTEXT}

TAREA: Análisis forense de disposiciones de alto riesgo

DATOS DETECTADOS:
{json.dumps(disposiciones_criticas, indent=2)}

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
```

#### Prompt Gemini 2.5 Flash (Screening)

```python
GEMINI_PROMPT_SCREENING = f"""
{FINDEP_CONTEXT}

TAREA: Screening rápido de disposiciones con alertas de riesgo medio-alto

DATOS:
{json.dumps(disposiciones_moderadas, indent=2)}

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
```

---

## 5. Sistema RAG - Memoria Institucional (Fase 2)

### 5.1 Arquitectura RAG

```
Anomalía detectada (score ≥80)
        ↓
Generar embedding con Gemini
        ↓
Búsqueda vectorial en knowledge base
        ↓
Recuperar top-5 casos históricos similares (similitud ≥75%)
        ↓
Enriquecer prompt de Claude con contexto histórico
        ↓
Análisis con memoria institucional
```

### 5.2 Estructura de Knowledge Base

```
knowledge_base/
├── fraudes_confirmados.json       # Casos históricos validados
├── controles_implementados.json   # Controles por tipo de fraude
├── patrones_sucursales.json       # Historial por sucursal
├── embeddings_cache/              # Vectores pre-calculados
│   ├── fraudes.npy                # NumPy array (N × 768 dims)
│   └── metadata.json              # Mapeo índice → caso
└── README.md                      # Guía de documentación
```

### 5.3 Esquema de Caso Histórico

```json
{
  "id": "FRAUDE-2024-Q2-GDL-001",
  "fecha_deteccion": "2024-06-15",
  "fecha_confirmacion": "2024-07-03",
  "estado": "confirmado | en_investigacion | falso_positivo",
  "tipo": "Colusión empleado-cliente",
  "subtipo": "Identidades sintéticas coordinadas",
  "sucursal": 127,
  "sucursal_nombre": "Guadalajara Centro",
  "empleados_involucrados": [4521, 4589],
  "num_clientes_afectados": 8,
  "patrones_detectados": [
    "Múltiples disposiciones misma jornada (8 en 15 min)",
    "Teléfonos compartidos entre clientes",
    "Horarios irregulares (6 ops después 18:00hrs)"
  ],
  "banderas_activadas": [
    "Tel de Colaborador",
    "Contratos <3min",
    "+1 mismo día",
    "Fuera horario"
  ],
  "impacto": {
    "financiero_mxn": 230400.50,
    "operaciones_fraudulentas": 15,
    "periodo": "2024-05-20 a 2024-06-10"
  },
  "descripcion_detallada": "Empleado #4521 procesó 15 disposiciones a 8 identidades sintéticas coordinadas. Todos los clientes compartían el mismo teléfono registrado. Investigación confirmó que los clientes eran familiares del empleado usando documentos de identidad de terceros...",
  "controles_aplicados_despues": [
    {
      "control": "Límite 3 disposiciones/10min por empleado",
      "fecha_implementacion": "2024-07-15",
      "efectividad": "95% reducción en casos similares"
    },
    {
      "control": "Alerta automática cuando >2 clientes comparten teléfono",
      "fecha_implementacion": "2024-07-20",
      "efectividad": "Detectó 3 intentos en Q3-2024"
    }
  ],
  "lecciones_aprendidas": "La validación de identidad física era insuficiente. Empleados con acceso a caja deben tener supervisión adicional para operaciones >$15K MXN...",
  "fuente_investigacion": "Reporte Auditoría Interna #2024-AI-067",
  "investigadores": ["Auditoría Interna", "Contraloría"],
  "acciones_disciplinarias": "Despido empleado #4521, denuncia penal en curso",
  "recuperacion": {
    "monto_recuperado_mxn": 87300.00,
    "porcentaje_recuperacion": 37.9,
    "metodo": "Embargo salarios familiares, garantías"
  },
  "embeddings_generado": true,
  "ultima_actualizacion": "2024-09-15"
}
```

### 5.4 Generación de Embeddings

```python
import google.generativeai as genai
import numpy as np

def generar_embedding_caso(caso):
    """
    Genera embedding de un caso histórico usando Gemini
    """
    # Construir texto representativo del caso
    texto_caso = f"""
    Tipo fraude: {caso['tipo']} - {caso['subtipo']}
    Sucursal: {caso['sucursal_nombre']}
    Patrones: {', '.join(caso['patrones_detectados'])}
    Banderas: {', '.join(caso['banderas_activadas'])}
    Impacto: ${caso['impacto']['financiero_mxn']:,.2f} MXN en {caso['impacto']['operaciones_fraudulentas']} operaciones
    Descripción: {caso['descripcion_detallada'][:500]}
    """

    # Generar embedding con Gemini
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=texto_caso,
        task_type="retrieval_document"
    )

    return np.array(result['embedding'])

def construir_knowledge_base_inicial(casos_historicos):
    """
    Procesa casos históricos y genera embeddings
    """
    embeddings = []
    metadata = []

    for i, caso in enumerate(casos_historicos):
        embedding = generar_embedding_caso(caso)
        embeddings.append(embedding)
        metadata.append({
            "index": i,
            "caso_id": caso['id'],
            "tipo": caso['tipo'],
            "sucursal": caso['sucursal']
        })

    # Guardar embeddings
    embeddings_array = np.array(embeddings)
    np.save("knowledge_base/embeddings_cache/fraudes.npy", embeddings_array)

    # Guardar metadata
    with open("knowledge_base/embeddings_cache/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
```

### 5.5 Búsqueda Semántica

```python
from sklearn.metrics.pairwise import cosine_similarity

def buscar_casos_similares(anomalia_actual, top_k=5, threshold=0.75):
    """
    Busca casos históricos similares usando similaridad coseno
    """
    # 1. Generar embedding de la anomalía actual
    texto_anomalia = f"""
    Sucursal: {anomalia.sucursal}
    Empleado: {anomalia.usuario_op}
    Banderas: {', '.join(anomalia.banderas_activas)}
    Monto: ${anomalia.monto_mxn:,.2f} MXN
    Patrón temporal: {anomalia.patron_temporal}
    """

    embedding_actual = genai.embed_content(
        model="models/text-embedding-004",
        content=texto_anomalia,
        task_type="retrieval_query"
    )['embedding']

    # 2. Cargar embeddings históricos
    embeddings_historicos = np.load("knowledge_base/embeddings_cache/fraudes.npy")
    metadata = json.load(open("knowledge_base/embeddings_cache/metadata.json"))

    # 3. Calcular similaridad coseno
    similaridades = cosine_similarity(
        [embedding_actual],
        embeddings_historicos
    )[0]

    # 4. Filtrar por threshold y ordenar
    indices_similares = np.where(similaridades >= threshold)[0]
    indices_ordenados = indices_similares[np.argsort(-similaridades[indices_similares])]

    # 5. Recuperar top-k casos
    casos_similares = []
    for idx in indices_ordenados[:top_k]:
        caso_id = metadata[idx]['caso_id']
        caso_completo = cargar_caso_por_id(caso_id)
        casos_similares.append({
            "caso": caso_completo,
            "similitud": float(similaridades[idx])
        })

    return casos_similares

def cargar_caso_por_id(caso_id):
    """Carga caso completo desde JSON"""
    casos = json.load(open("knowledge_base/fraudes_confirmados.json"))
    return next(c for c in casos if c['id'] == caso_id)
```

### 5.6 Prompt Enriquecido con RAG

```python
CLAUDE_PROMPT_WITH_RAG = f"""
{FINDEP_CONTEXT}

ANOMALÍA ACTUAL DETECTADA:
{json.dumps(anomalia_detectada, indent=2)}

CASOS HISTÓRICOS SIMILARES (memoria institucional):
{json.dumps(casos_similares, indent=2)}

INSTRUCCIONES ADICIONALES:
1. Analiza la anomalía actual normalmente
2. Compara con los casos históricos similares proporcionados
3. Identifica si es:
   a) El mismo patrón de fraude
   b) Una variante del patrón conocido
   c) Un patrón completamente nuevo
4. Si es similar a caso histórico:
   - Aprovecha las "lecciones aprendidas" documentadas
   - Recomienda controles que funcionaron en el pasado
   - Advierte sobre errores previos a evitar
5. Si es patrón nuevo:
   - ALERTA explícitamente que es novedad
   - Sugiere análisis más profundo
   - Recomienda documentación detallada para futuro

FORMATO DE RESPUESTA (JSON):
{{
  ... [campos normales del análisis] ...,

  "comparacion_historico": {{
    "es_patron_conocido": true/false,
    "caso_mas_similar": {{
      "caso_id": "FRAUDE-2024-Q2-GDL-001",
      "porcentaje_similitud": 87.3,
      "similitudes": ["Factor 1", "Factor 2"],
      "diferencias": ["Factor nuevo: uso de SPEI no visto antes"]
    }},
    "nivel_novedad": "Patrón conocido | Variante de patrón | Completamente nuevo"
  }},

  "recomendaciones_basadas_en_historial": [
    {{
      "recomendacion": "Implementar control X",
      "caso_referencia": "FRAUDE-2024-Q2-GDL-001",
      "efectividad_previa": "95% reducción en recurrencia",
      "advertencia": "Requiere aprobación Comité Crédito"
    }}
  ],

  "alerta_novedad": {{
    "es_patron_nuevo": true/false,
    "justificacion": "Por qué es nuevo o diferente",
    "accion_requerida": "Documentar detalladamente para enriquecer base de conocimiento"
  }}
}}
"""
```

### 5.7 Aprendizaje Continuo

```python
def registrar_fraude_confirmado(anomalia, investigacion_completa):
    """
    Cuando un fraude se confirma, añadirlo a knowledge base
    """
    nuevo_caso = {
        "id": f"FRAUDE-{datetime.now().strftime('%Y-Q%q')}-{anomalia.sucursal}-{random.randint(100,999)}",
        "fecha_deteccion": anomalia.fecha_analisis,
        "fecha_confirmacion": datetime.now().isoformat(),
        "estado": "confirmado",
        "tipo": investigacion_completa['tipo_fraude'],
        # ... resto de campos
    }

    # 1. Añadir a JSON
    casos = json.load(open("knowledge_base/fraudes_confirmados.json"))
    casos.append(nuevo_caso)
    with open("knowledge_base/fraudes_confirmados.json", "w") as f:
        json.dump(casos, f, indent=2)

    # 2. Generar y añadir embedding
    nuevo_embedding = generar_embedding_caso(nuevo_caso)

    embeddings = np.load("knowledge_base/embeddings_cache/fraudes.npy")
    embeddings = np.vstack([embeddings, nuevo_embedding])
    np.save("knowledge_base/embeddings_cache/fraudes.npy", embeddings)

    # 3. Actualizar metadata
    metadata = json.load(open("knowledge_base/embeddings_cache/metadata.json"))
    metadata.append({
        "index": len(metadata),
        "caso_id": nuevo_caso['id'],
        "tipo": nuevo_caso['tipo'],
        "sucursal": nuevo_caso['sucursal']
    })
    with open("knowledge_base/embeddings_cache/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Caso {nuevo_caso['id']} añadido a knowledge base")
```

---

## 6. Flujos de Interacción

### 6.1 Flujo: Análisis Predictivo Básico

```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 3 días"
    ↓
Agent detecta modo PREDICTIVO (keyword: "analiza")
    ↓
1. Ejecuta query BigQuery con scoring
   - Query: queries/base_disposiciones.sql con WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
   - Resultado: 847 disposiciones, 23 con risk_score > 0
    ↓
2. Categoriza anomalías
   - 2 casos críticos (score ≥80)
   - 8 casos altos (score 40-79)
   - 13 casos medios (score 20-39)
    ↓
3. Análisis con LLM
   - Críticos (2): Claude Opus 4.6 → análisis forense
   - Altos (8): Gemini 2.5 Flash → screening
   - Medios (13): Solo métricas, sin LLM
    ↓
4. Genera respuesta conversacional
    ↓
Agent: "Analicé 847 disposiciones (últimos 3 días).

🔴 Detecté 1 alerta crítica de colusión empleado-cliente:
   - Empleado #4521 (Sucursal 127) procesó 8 disposiciones en 14 minutos
   - Todos los clientes comparten teléfono registrado
   - Impacto: $127,400 MXN
   - Recomendación: Bloqueo inmediato, revisar video vigilancia

🟡 8 casos de riesgo alto requieren atención:
   - 5 disposiciones foráneas en efectivo >$20K (Bajío)
   - 3 operaciones fuera de horario con calificación ≤5

🟢 13 casos de riesgo medio en monitoreo

¿Deseas que profundice en la alerta crítica o analice algún caso específico?"
    ↓
Usuario: "Analiza el historial del empleado #4521"
    ↓
[Flujo: Investigación Dirigida - ver 6.2]
```

### 6.2 Flujo: Investigación Dirigida

```
Usuario: "Analiza el historial del empleado #4521 últimos 90 días"
    ↓
Agent detecta parámetros:
   - Entidad: empleado
   - ID: 4521
   - Periodo: 90 días
    ↓
1. Ejecuta query parametrizada
   - Query: queries/analisis_empleado.sql
   - Parámetro: usuario_op = 4521, fecha >= -90 días
   - Resultado: 342 disposiciones
    ↓
2. Análisis agregado
   - Total monto: $4.2M MXN
   - Promedio por operación: $12,280 MXN
   - Banderas detectadas: 78 operaciones (22.8%)
   - Distribución temporal: picos en viernes tarde
    ↓
3. Scoring y categorización
   - 15 operaciones críticas
   - 32 operaciones altas
   - 31 operaciones medias
    ↓
4. Análisis con Claude Opus (caso crítico)
    ↓
Agent: "Historial empleado #4521 (últimos 90 días):

**Resumen operativo:**
- 342 disposiciones totales ($4.2M MXN)
- Promedio: 3.8 disposiciones/día (promedio cajero: 2.0)
- 78 operaciones con banderas de riesgo (22.8% vs. promedio 8%)

**Patrones detectados:**
1. Colusión persistente:
   - 23% de operaciones muestran bandera 'Tel de Colaborador'
   - Correlación alta con 3 clientes específicos (CLT-89234, CLT-90122, CLT-88901)

2. Concentración temporal sospechosa:
   - 45% de operaciones en viernes 16:00-18:00hrs
   - Picos coinciden con cambios de turno (supervisión reducida)

3. Montos progresivamente mayores:
   - Primeras 2 semanas: promedio $8K MXN
   - Últimas 2 semanas: promedio $18K MXN
   - Patrón de 'testeo' típico de fraude organizado

**Recomendación ejecutiva:**
Investigación formal de colusión con prioridad ALTA.
Evidencia suficiente para justificar suspensión temporal y auditoría completa.

¿Deseas que compare con otros empleados de la sucursal 127 o que analice a los 3 clientes correlacionados?"
```

### 6.3 Flujo: Consulta Operativa (sin análisis)

```
Usuario: "Agent_disp_BQ disposiciones sucursal 127 última semana"
    ↓
Agent detecta modo OPERATIVO (sin keywords predictivos)
    ↓
1. Ejecuta query simple
   - Query: SELECT * FROM disposicion WHERE sucursal = 127 AND fecha >= -7 días
   - Sin scoring, sin análisis LLM
    ↓
Agent: "Disposiciones Sucursal 127 (última semana):

| Fecha | Contrato | Monto MXN | Tipo | Empleado |
|-------|----------|-----------|------|----------|
| 2026-03-27 | CTR-89234 | 24,500 | EFECTIVO | 4521 |
| 2026-03-27 | CTR-90122 | 18,200 | CHEQUE | 4521 |
| ... (47 registros más)

Total: 49 disposiciones, $847,300 MXN
Promedio: $17,292 MXN por operación

¿Necesitas análisis de riesgos de estas operaciones?"
```

### 6.4 Flujo: Análisis con RAG (Fase 2)

```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 3 días"
    ↓
[Pasos 1-2 iguales a flujo 6.1]
    ↓
3. Para anomalía crítica, activar RAG
   - Anomalía: Colusión empleado #4521
   - Generar embedding de la anomalía
   - Buscar en knowledge base
    ↓
Búsqueda semántica encuentra:
   - FRAUDE-2024-Q2-GDL-001 (similitud: 87.3%)
   - FRAUDE-2024-Q3-QRO-045 (similitud: 79.1%)
   - FRAUDE-2025-Q1-MTY-012 (similitud: 76.8%)
    ↓
4. Enriquecer análisis Claude con casos históricos
    ↓
Agent: "🔴 ALERTA CRÍTICA - Colusión empleado-cliente (confianza: 92%)

[... análisis normal ...]

**COMPARACIÓN CON HISTORIAL INSTITUCIONAL:**

Este patrón es 87% similar al fraude FRAUDE-2024-Q2-GDL-001 detectado en Guadalajara (Q2-2024):
- Mismo modus operandi: empleado procesa múltiples disposiciones a identidades sintéticas
- Similitud: teléfonos compartidos, horarios irregulares
- Diferencia clave: caso actual usa SPEI (no visto en 2024)
- Impacto previo: $230K MXN confirmados

**LECCIONES DEL CASO HISTÓRICO:**
1. ✅ Control implementado: Límite 3 disposiciones/10min
   - Efectividad: 95% reducción en casos similares
   - Recomendación: Aplicar mismo control a sucursal 127

2. ⚠️ Error previo a evitar:
   - En 2024 se retrasó la suspensión del empleado 5 días
   - Resultado: pérdida adicional de $80K MXN
   - Acción ahora: Suspensión inmediata justificada

**NOVEDAD DETECTADA:**
⚠️ El uso de SPEI para dispersión es NUEVO (no documentado en casos históricos).
Sugiero documentación detallada para enriquecer base de conocimiento.

¿Confirmas que proceda con suspensión del empleado #4521 y registro de este caso en knowledge base?"
```

---

## 7. Controles de Presupuesto

### 7.1 Configuración de Límites

```python
# config.py
class PresupuestoConfig(BaseSettings):
    # Forzar solo Gemini (más económico)
    FORCE_GEMINI_ONLY: bool = False

    # Límite mensual de llamadas a Claude Opus
    MAX_CLAUDE_CALLS_PER_MONTH: int = 20  # Max $6/mes

    # Requerir confirmación antes de usar Claude
    CONFIRM_BEFORE_CLAUDE: bool = True

    # Tracking de uso mensual
    USAGE_TRACKING_FILE: str = "./logs/usage_monthly.json"
```

### 7.2 Tracking de Uso

```python
import json
from datetime import datetime

def registrar_uso_llm(modelo, costo_estimado):
    """
    Registra cada llamada a LLM para tracking de costos
    """
    mes_actual = datetime.now().strftime("%Y-%m")

    # Cargar tracking mensual
    try:
        with open("logs/usage_monthly.json", "r") as f:
            tracking = json.load(f)
    except FileNotFoundError:
        tracking = {}

    if mes_actual not in tracking:
        tracking[mes_actual] = {
            "claude_calls": 0,
            "claude_cost_usd": 0,
            "gemini_calls": 0,
            "gemini_cost_usd": 0,
            "total_cost_usd": 0
        }

    # Actualizar contadores
    if "claude" in modelo:
        tracking[mes_actual]["claude_calls"] += 1
        tracking[mes_actual]["claude_cost_usd"] += costo_estimado
    elif "gemini" in modelo:
        tracking[mes_actual]["gemini_calls"] += 1
        tracking[mes_actual]["gemini_cost_usd"] += costo_estimado

    tracking[mes_actual]["total_cost_usd"] = (
        tracking[mes_actual]["claude_cost_usd"] +
        tracking[mes_actual]["gemini_cost_usd"]
    )

    # Guardar
    with open("logs/usage_monthly.json", "w") as f:
        json.dump(tracking, f, indent=2)

    return tracking[mes_actual]

def verificar_limite_presupuesto():
    """
    Verifica si se alcanzó el límite mensual
    """
    mes_actual = datetime.now().strftime("%Y-%m")

    try:
        with open("logs/usage_monthly.json", "r") as f:
            tracking = json.load(f)

        if mes_actual in tracking:
            claude_calls = tracking[mes_actual]["claude_calls"]
            max_calls = config.MAX_CLAUDE_CALLS_PER_MONTH

            if claude_calls >= max_calls:
                print(f"⚠️ Límite mensual de Claude alcanzado ({claude_calls}/{max_calls})")
                print(f"   Costo acumulado: ${tracking[mes_actual]['total_cost_usd']:.2f} USD")
                print(f"   Usando Gemini para análisis restantes del mes")
                return False  # No permitir más llamadas a Claude
    except FileNotFoundError:
        pass

    return True  # OK para usar Claude
```

### 7.3 Reporte de Costos

```python
def generar_reporte_costos(mes=None):
    """
    Genera reporte de costos del mes
    """
    if mes is None:
        mes = datetime.now().strftime("%Y-%m")

    with open("logs/usage_monthly.json", "r") as f:
        tracking = json.load(f)

    if mes not in tracking:
        return f"No hay datos para {mes}"

    data = tracking[mes]

    reporte = f"""
REPORTE DE COSTOS - {mes}
{'='*50}

Claude Opus 4.6:
  - Llamadas: {data['claude_calls']}
  - Costo: ${data['claude_cost_usd']:.2f} USD
  - Promedio: ${data['claude_cost_usd']/max(data['claude_calls'],1):.3f} USD/análisis

Gemini 2.5 Flash:
  - Llamadas: {data['gemini_calls']}
  - Costo: ${data['gemini_cost_usd']:.2f} USD
  - Promedio: ${data['gemini_cost_usd']/max(data['gemini_calls'],1):.3f} USD/análisis

TOTAL: ${data['total_cost_usd']:.2f} USD

Distribución:
  - Claude: {data['claude_calls']/(data['claude_calls']+data['gemini_calls'])*100:.1f}%
  - Gemini: {data['gemini_calls']/(data['claude_calls']+data['gemini_calls'])*100:.1f}%
"""

    return reporte
```

---

## 8. Plan de Implementación

### 8.1 Fase 1: Motor Híbrido (Semana 1)

#### Día 1-2: Setup Inicial

**Tareas:**
1. Crear estructura de directorios
2. Configurar environment variables
3. Copiar query SQL base
4. Instalar dependencias

**Deliverables:**
```bash
Agent_disp_BQ_resources/
├── config.py                # ✅ Configurado
├── requirements.txt         # ✅ Dependencias definidas
├── .env.example             # ✅ Template de configuración
├── queries/
│   └── base_disposiciones.sql  # ✅ Query usuario copiada
└── logs/                    # ✅ Directorio logs
```

**Comandos:**
```bash
cd ~/.claude/agents
mkdir -p Agent_disp_BQ_resources/{queries,logs,knowledge_base}
cd Agent_disp_BQ_resources

# Crear requirements.txt
cat > requirements.txt << 'EOF'
google-cloud-bigquery==3.25.0
anthropic==0.34.0
google-generativeai==0.8.0
httpx==0.27.0
numpy==1.26.4
scikit-learn==1.5.1
python-dotenv==1.0.1
pydantic==2.9.0
rich==13.8.0
EOF

# Crear .env.example
cat > .env.example << 'EOF'
# BigQuery
BQ_PROJECT_ID=ws-ctrol-interno
BQ_LOCATION=US

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Gemini API
GEMINI_API_KEY=...

# Presupuesto
FORCE_GEMINI_ONLY=false
MAX_CLAUDE_CALLS_PER_MONTH=20
CONFIRM_BEFORE_CLAUDE=true
EOF

# Instalar dependencias
pip install -r requirements.txt
```

#### Día 3-4: Implementación Core

**Tareas:**
1. Implementar `bigquery_client.py`
2. Implementar `risk_scoring.py`
3. Implementar `llm_router.py`
4. Implementar `prompts.py`
5. Implementar `analyzer.py` (orquestador)

**Testing intermedio:**
- Validar conexión a BigQuery
- Probar scoring con datos sintéticos
- Verificar APIs de Claude/Gemini

#### Día 5: Testing con Datos Reales

**Tareas:**
1. Ejecutar análisis de últimos 7 días
2. Validar categorización de riesgos
3. Verificar costos reales vs. estimados
4. Ajustar umbrales si necesario

**Criterios de éxito:**
- [ ] Query BigQuery ejecuta en <10s
- [ ] Scoring categoriza correctamente (manual validation)
- [ ] Análisis Claude/Gemini genera JSON válido
- [ ] Costo total < $1 por análisis completo

#### Día 6-7: Integración con Agente

**Tareas:**
1. Actualizar `Agent_disp_BQ.md` con lógica dual
2. Probar invocación desde Claude Code
3. Validar detección automática de modo
4. Documentar comandos de uso

**Entregable:** Agent_disp_BQ funcional con modo predictivo

### 8.2 Fase 2: Sistema RAG (Semana 2-3)

#### Día 8-10: Construcción Knowledge Base

**Tareas:**
1. Documentar 5-10 fraudes históricos conocidos
   - Si existen reportes de auditoría, usarlos como fuente
   - Si no, crear casos sintéticos basados en patrones conocidos
2. Generar embeddings con Gemini
3. Implementar `rag_engine.py`

**Deliverable:** `knowledge_base/fraudes_confirmados.json` con ≥5 casos

#### Día 11-13: Integración RAG

**Tareas:**
1. Integrar búsqueda semántica en `analyzer.py`
2. Actualizar prompts para incluir contexto histórico
3. Testing con casos reales

**Criterios de éxito:**
- [ ] Búsqueda vectorial ejecuta en <2s
- [ ] Recupera casos relevantes (validación manual)
- [ ] Análisis enriquecido con RAG es superior a análisis standalone

#### Día 14: Refinamiento y Documentación

**Tareas:**
1. Ajustar umbrales de similitud
2. Optimizar performance
3. Documentar proceso de añadir nuevos casos
4. Crear guía de uso completa

**Entregable:** Sistema RAG operativo y documentado

### 8.3 Fase 3: Evolución Continua

**Mensual:**
- Revisar falsos positivos y ajustar scoring
- Actualizar knowledge base con fraudes confirmados
- Analizar métricas de uso y costos
- Refinamiento de prompts según feedback

---

## 9. Criterios de Éxito

### 9.1 Métricas Técnicas

| Métrica | Objetivo | Método de medición |
|---------|----------|-------------------|
| **Performance** |
| Tiempo de análisis | <30s para 1000 disposiciones | Logging de tiempos |
| Disponibilidad | 99% (fallas solo si BigQuery/APIs down) | Monitoreo manual |
| **Precisión** |
| Falsos positivos | <20% | Validación manual mensual |
| Fraudes detectados | 100% de casos críticos | Comparar con auditorías |
| **Costos** |
| Costo por análisis | <$0.30 promedio | Tracking automático |
| Costo mensual total | <$10/mes uso moderado | Reporte mensual |
| **RAG (Fase 2)** |
| Recall casos similares | >80% | Validación con casos conocidos |
| Precisión búsqueda | >75% similitud promedio | Métricas automáticas |

### 9.2 Métricas de Negocio

| Métrica | Baseline | Objetivo | Plazo |
|---------|----------|----------|-------|
| Tiempo de investigación fraude | 3-5 días | <1 día | 3 meses |
| Fraudes detectados proactivamente | 0% (100% reactivo) | 40% | 6 meses |
| Pérdidas por fraude | [Baseline actual] | -40% | 12 meses |
| Conocimiento documentado | 0 casos formales | 20+ casos | 6 meses |

### 9.3 Validación

**Semana 1 (post Fase 1):**
- Ejecutar análisis de últimos 30 días
- Comparar detecciones del agente vs. fraudes conocidos
- Validar que 100% de fraudes conocidos fueron detectados

**Mes 1:**
- Usar agente en paralelo con proceso manual
- Comparar tiempos de investigación
- Recopilar feedback de usuarios (Auditoría, Riesgos)

**Mes 3:**
- Evaluar reducción en tiempo de investigación
- Medir falsos positivos reales
- Ajustar umbrales según feedback

**Mes 6:**
- Análisis de impacto en pérdidas por fraude
- ROI: comparar costo del agente vs. fraudes evitados
- Decisión: expansión a otros productos (no solo revolventes)

---

## 10. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Falsos positivos altos** | Media | Alto | - Ajustar umbrales progresivamente<br>- Validación manual primeros 30 días<br>- Feedback loop continuo |
| **Costos exceden presupuesto** | Baja | Medio | - Límites configurables<br>- Tracking automático<br>- Confirmación antes de Claude |
| **APIs de LLM caídas** | Baja | Alto | - Fallback Gemini ↔ Claude<br>- Modo solo-métricas sin LLM<br>- Retry logic con backoff |
| **BigQuery query lenta** | Media | Medio | - Optimizar SQL con QUALIFY<br>- Limitar a 500 resultados<br>- Cacheo de resultados frecuentes |
| **Knowledge base desactualizada** | Alta | Medio | - Proceso documentado de actualización<br>- Reminder mensual<br>- Automatizar con confirmación de fraudes |
| **Exposición de PII** | Baja | Crítico | - Prompts explícitos anti-PII<br>- Validación automática de outputs<br>- Logs auditables |
| **Uso indebido (ataques)** | Baja | Alto | - Solo acceso local (no API pública)<br>- Logs de todas las consultas<br>- Requiere auth GCP |

---

## 11. Apéndices

### 11.1 Ejemplo de Salida Completa

**Input:**
```
Usuario: "Agent_disp_BQ analiza disposiciones últimos 3 días"
```

**Output esperado:**
```
Analicé 847 disposiciones del periodo 2026-03-25 a 2026-03-28.

════════════════════════════════════════
RESUMEN EJECUTIVO
════════════════════════════════════════

Total analizado: 847 disposiciones
Monto total: $11,234,500 MXN
Anomalías detectadas: 23 casos (2.7%)

Distribución de riesgos:
  🔴 CRÍTICO: 2 casos (requieren acción inmediata)
  🟡 ALTO: 8 casos (atención en 24-48hrs)
  🟠 MEDIO: 13 casos (monitoreo)

════════════════════════════════════════
🔴 ALERTAS CRÍTICAS
════════════════════════════════════════

[1] Colusión empleado-cliente - Sucursal 127 (Querétaro)
────────────────────────────────────────
Confianza: 92%
Impacto: $127,400 MXN en 8 operaciones

MECÁNICA DEL ESQUEMA:
Empleado #4521 procesó 8 disposiciones en 14 minutos (2026-03-27, 14:05-14:19).
Todos los clientes comparten el mismo teléfono registrado: +52-442-XXX-2891.
Patrón coincide con "identidades sintéticas coordinadas".

EVIDENCIA:
- 8 contratos distintos, 1 solo teléfono
- Procesamiento secuencial sin tiempos de espera (cliente "presente")
- 6 de 8 operaciones fuera de horario normal
- Empleado tiene historial: 23% de ops con banderas (vs. 8% promedio)

ACTORES:
- Empleado #4521 (Cajera Principal): Orquestador
- Clientes CTR-89234, CTR-90122, CTR-88901: Beneficiarios (posibles identidades sintéticas)
- Sucursal 127: Facilitador (supervisión insuficiente)

ACCIONES INMEDIATAS:
1. ⏱️ AHORA: Suspender operaciones empleado #4521
2. ⏱️ 2 horas: Revisar video vigilancia caja 12, 14:00-15:00
3. ⏱️ 24 horas: Auditoría completa empleado (últimos 90 días)
4. ⏱️ 24 horas: Verificación física identidad de 3 clientes

CONTROLES PREVENTIVOS:
- Límite: máx 3 disposiciones por empleado en ventana de 10 minutos
- Alerta automática: cuando >2 clientes comparten teléfono
- Supervisión obligatoria: operaciones >$15K MXN

🔍 MEMORIA INSTITUCIONAL:
Patrón 87% similar a FRAUDE-2024-Q2-GDL-001 (Guadalajara, Jun-2024).
Caso histórico: $230K MXN pérdida confirmada.
Control implementado entonces (límite 3 disp/10min) redujo recurrencia 95%.
⚠️ NOVEDAD: Caso actual usa dispersión vía SPEI (no documentado en 2024).

════════════════════════════════════════
🟡 CASOS DE RIESGO ALTO (top 3)
════════════════════════════════════════

[2] Disposiciones foráneas efectivo - Región Bajío
────────────────────────────────────────
Patrón: 5 disposiciones >$20K en efectivo, sucursales foráneas
Monto total: $112,300 MXN
Recomendación: Revisar políticas sucursales 089, 156, 201

[3] Operaciones fuera de horario - Sucursal 043
────────────────────────────────────────
Patrón: 3 disposiciones 18:30-19:45hrs (fuera de horario oficial)
Clientes con calificación ≤5
Recomendación: Auditar controles de horario sucursal

[... 5 casos más resumidos ...]

════════════════════════════════════════
📊 MÉTRICAS CONTEXTUALES
════════════════════════════════════════

Comparación vs. periodo anterior (3 días previos):
- Volumen: +8.2% (784 → 847)
- Monto promedio: -3.1% ($13,560 → $13,267)
- Tasa de anomalías: +120% (1.2% → 2.7%) ⚠️

Top 3 sucursales por volumen:
1. Sucursal 127 (Querétaro): 89 ops, $1.2M MXN
2. Sucursal 089 (León): 76 ops, $987K MXN
3. Sucursal 043 (San Luis Potosí): 71 ops, $891K MXN

════════════════════════════════════════

¿Deseas que profundice en algún caso específico o que analice el historial de la Sucursal 127?

Comandos disponibles:
- "Analiza empleado #4521 últimos 90 días"
- "Analiza sucursal 127 esta semana"
- "Compara Bajío esta semana vs semana pasada"
- "Briefing de riesgos"
```

### 11.2 Estructura de Logs

```json
// logs/analisis_20260328_083045.json
{
  "timestamp": "2026-03-28T08:30:45Z",
  "usuario": "hgalvezb@findep.com.mx",
  "query_original": "Agent_disp_BQ analiza disposiciones últimos 3 días",
  "modo_detectado": "PREDICTIVO",
  "periodo_analizado": {
    "inicio": "2026-03-25",
    "fin": "2026-03-28",
    "dias": 3
  },
  "bigquery": {
    "query_file": "queries/base_disposiciones.sql",
    "execution_time_seconds": 4.2,
    "rows_scanned": 847,
    "bytes_processed": 12457890,
    "cost_usd": 0.00006
  },
  "anomalias_detectadas": {
    "total": 23,
    "criticas": 2,
    "altas": 8,
    "medias": 13,
    "bajas": 0
  },
  "llm_usage": [
    {
      "caso_id": "DISP-2026-03-27-00234",
      "score": 110,
      "modelo": "claude-opus-4.6",
      "tokens_input": 3240,
      "tokens_output": 1850,
      "cost_usd": 0.28,
      "latency_seconds": 18.3
    },
    {
      "caso_id": "DISP-2026-03-27-00891",
      "score": 95,
      "modelo": "claude-opus-4.6",
      "tokens_input": 2890,
      "tokens_output": 1620,
      "cost_usd": 0.24,
      "latency_seconds": 15.7
    },
    {
      "casos_agrupados": "8 casos riesgo alto",
      "modelo": "gemini-2.5-flash",
      "tokens_input": 4500,
      "tokens_output": 980,
      "cost_usd": 0.02,
      "latency_seconds": 6.2
    }
  ],
  "rag_usage": {
    "enabled": true,
    "casos_criticos_buscados": 2,
    "casos_similares_encontrados": [
      {
        "anomalia_id": "DISP-2026-03-27-00234",
        "casos_historicos": [
          {
            "caso_id": "FRAUDE-2024-Q2-GDL-001",
            "similitud": 0.873
          }
        ]
      }
    ],
    "embeddings_generation_seconds": 2.1,
    "vector_search_seconds": 0.8
  },
  "costos_total": {
    "bigquery_usd": 0.00006,
    "claude_usd": 0.52,
    "gemini_usd": 0.02,
    "total_usd": 0.54006
  },
  "tiempo_total_seconds": 42.7
}
```

### 11.3 Dependencias Completas

```txt
# requirements.txt (versión final)

# Google Cloud
google-cloud-bigquery==3.25.0
google-cloud-logging==3.10.0

# LLM APIs
anthropic==0.34.0              # Claude API
google-generativeai==0.8.0     # Gemini API (SDK alternativo)
httpx==0.27.0                  # Para Gemini REST API

# ML/RAG (Fase 2)
numpy==1.26.4
scikit-learn==1.5.1            # Similaridad coseno

# Configuración y validación
python-dotenv==1.0.1
pydantic==2.9.0
pydantic-settings==2.5.0

# Utilidades
rich==13.8.0                   # Output formateado en terminal
tenacity==8.5.0                # Retry logic para APIs

# Testing
pytest==8.3.0
pytest-asyncio==0.24.0
```

---

## 12. Glosario

| Término | Definición |
|---------|------------|
| **Anomalía** | Disposición con risk_score > 0 (al menos 1 bandera activa) |
| **Bandera** | Indicador binario de riesgo (ej: "Tel de Colaborador") |
| **Colusión** | Fraude coordinado entre empleado y cliente(s) |
| **Embedding** | Representación vectorial (768 dims) de un texto para búsqueda semántica |
| **Fraccionamiento** | Dividir monto grande en múltiples operaciones pequeñas para evadir límites |
| **Knowledge base** | Base de datos de casos históricos de fraude con embeddings |
| **LLM** | Large Language Model (Claude Opus 4.6, Gemini 2.5 Flash) |
| **PII** | Personally Identifiable Information (nombre, teléfono, CURP, RFC) |
| **RAG** | Retrieval Augmented Generation (búsqueda + generación) |
| **Risk score** | Puntuación 0-150+ calculada por suma de banderas activas |
| **Similaridad coseno** | Métrica de similitud entre vectores (0-1, donde 1 = idénticos) |

---

**FIN DE ESPECIFICACIÓN**

Este documento será la base para la implementación del Agent_disp_BQ con modalidad predictiva.
Requiere revisión y aprobación del usuario antes de proceder a la fase de planificación detallada.

Última actualización: 2026-03-28
