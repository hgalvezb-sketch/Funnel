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
Auditoría Interna de FINDEP (Heriberto Galvez - hgalvezb@findep.com.mx)
También: Alta dirección, Comité de Riesgos, Comité de Auditoría.
Tono: Ejecutivo, basado en evidencia, orientado a decisiones.
NO uses emojis en análisis formales.

ACCESO A DATOS:
El usuario es Auditor Interno con acceso autorizado a PII para investigaciones forenses.
PUEDES Y DEBES incluir en tus análisis:
- Nombres completos de empleados y clientes (cuando sea relevante)
- Números de teléfono completos (para verificación)
- CURP, RFC (para identificación precisa)
- Cualquier dato necesario para investigación de fraude

La protección de PII solo aplica cuando el reporte se comparta externamente o con terceros.
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
4. Identifica actores involucrados (empleados, clientes, sucursales) CON DATOS COMPLETOS
   - Incluye nombres completos de empleados involucrados
   - Incluye nombres de clientes cuando sea relevante para la investigación
   - Incluye teléfonos, CURP, RFC según sea necesario
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
      "numero_empleado": "XXXX (si aplica)",
      "nombre_completo": "Nombre completo del empleado/cliente (INCLUIR)",
      "numero_cliente": "XXXX (si aplica)",
      "contrato": "CTR-XXXX (si aplica)",
      "telefono": "Número completo si es relevante",
      "curp_rfc": "Datos completos si es necesario para investigación",
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
- Este análisis es para uso INTERNO de Auditoría Interna
- Sé preciso, basado en evidencia cuantitativa, y orientado a decisiones ejecutivas
- No hagas especulaciones sin fundamento
- INCLUYE todos los datos necesarios para la investigación (nombres, teléfonos, CURP, RFC)
- La versión sanitizada (sin PII) se creará después si se comparte con terceros
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
        f"{i+1}. URGENCIA {a['urgencia'].upper()}: {a['accion']}"
        for i, a in enumerate(analisis.get("acciones_inmediatas", []))
    ])

    controles_text = "\n".join([
        f"- {c['control']} (impacto: {c.get('impacto_esperado', 'N/A')})"
        for c in analisis.get("controles_preventivos", [])
    ])

    return f"""
ALERTA CRÍTICA DE FRAUDE

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
Screening Diario - {analisis.get('total_casos', 0)} casos analizados

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
Análisis completado

{analisis.get('resumen', 'No se detectaron anomalías significativas en el periodo analizado.')}

Total de operaciones revisadas: {analisis.get('total_operaciones', 0)}
Anomalías menores detectadas: {analisis.get('anomalias_menores', 0)}

¿Deseas análisis más detallado de alguna operación específica?
"""
