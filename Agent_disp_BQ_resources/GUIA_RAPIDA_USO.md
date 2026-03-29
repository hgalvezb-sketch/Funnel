# Agent_disp_BQ Predictivo - Guía Rápida de Uso

**Para:** Heriberto Galvez (hgalvezb@findep.com.mx)
**Fecha:** 29 de Marzo, 2026
**Sistema:** Detección Predictiva de Fraudes en Disposiciones

---

## 📋 ABC - Cómo Invocarlo

### Opción 1: Desde Claude Code (Recomendado)

Simplemente escribe en Claude Code:

```
Agent_disp_BQ analiza disposiciones últimos 3 días
```

**Variantes que funcionan:**
- `"Agent_disp_BQ analiza disposiciones últimos 7 días"`
- `"Agent_disp_BQ ¿hay algo atípico en las disposiciones?"`
- `"Agent_disp_BQ briefing de riesgos última semana"`
- `"Agent_disp_BQ detecta fraudes últimos 5 días"`

**Keywords que activan modo predictivo:**
- `analiza`, `analizar`
- `anomalías`, `atípico`
- `riesgo`, `fraude`
- `briefing`, `alerta`
- `patrón`, `sospechoso`
- `detecta`, `predice`

### Opción 2: CLI Directo

```bash
cd Agent_disp_BQ_resources
python analyzer.py
```

Por defecto analiza **últimos 3 días**.

---

## 🚨 Tipos de Alertas que Recibirás

### Nivel CRÍTICO (Score ≥80)
**Qué significa:** Fraude altamente probable, requiere acción inmediata

**Ejemplo de alerta:**
```
🔴 ALERTA CRÍTICA DE FRAUDE

Detecté un patrón de Colusión empleado-cliente en Sucursal 127.

Empleado #4521 procesó 8 disposiciones en 14 minutos.
Todos los clientes comparten el mismo teléfono registrado.

Impacto estimado: $127,400 MXN en 8 operaciones

ACCIONES REQUERIDAS (INMEDIATAS):
1. ⏱️ AHORA: Bloquear temporalmente operaciones del empleado #4521
2. ⏱️ 2 horas: Revisar video vigilancia de caja, horario 14:00-15:30
3. ⏱️ 24 horas: Auditoría completa de operaciones del empleado (últimos 30 días)

¿Deseas que profundice en el histórico de este empleado?
```

**Banderas que causan CRÍTICO:**
- Tel de Colaborador (35 pts)
- Pago SPEI Colab (40 pts)
- Contratos <3min (35 pts)
- Monto duplicado mismo día (30 pts)
- Combinación de 3+ banderas

**Qué hacer:**
1. Leer el análisis completo
2. Verificar video vigilancia
3. Contactar a Seguridad/Auditoría Interna
4. Documentar caso

---

### Nivel ALTO (Score 40-79)
**Qué significa:** Anomalía sospechosa, requiere investigación en 24-48h

**Ejemplo de alerta:**
```
🟡 Screening Diario - 23 casos analizados

Distribución: 0 críticos, 8 altos, 15 medios

Top 3 casos prioritarios:

[1] Fraccionamiento detectado - Sucursal 95
    Monto: $24,500 MXN
    Banderas: +1 mismo día, Fuera horario, Disp >24K
    Recomendación: Revisar justificación con Gerente Sucursal

[2] Patrón irregular horario - Sucursal 127
    Monto: $18,200 MXN
    Banderas: Fuera horario, Foráneas efectivo
    Recomendación: Validar con empleado motivo de horario atípico

[3] Tel repetido - Cliente CTR-88945
    Monto: $12,300 MXN
    Banderas: Tel repetido, Calificación ≤5
    Recomendación: Verificar identidad del cliente

¿Quieres que analice en profundidad algún caso?
```

**Banderas que causan ALTO:**
- +1 mismo día (25 pts)
- Fuera horario (20 pts)
- Foráneas efectivo (20 pts)
- Tel repetido (25 pts)
- Combinación de 2 banderas

**Qué hacer:**
1. Revisar casos priorizados
2. Contactar a gerentes de sucursal
3. Validar justificaciones
4. Seguimiento en 24-48h

---

### Nivel MEDIO (Score 20-39)
**Qué significa:** Riesgo moderado, monitoreo continuo

**Ejemplo de alerta:**
```
🟢 15 caso(s) de riesgo MEDIO en monitoreo.

Tendencias detectadas:
- Incremento 12% en disposiciones quincena vs. semana anterior
- 5 clientes con calificación ≤5 realizaron disposiciones
- Promedio días vencidos: 45 días (dentro de parámetros normales)

Recomendación: Monitoreo rutinario, sin acciones inmediatas requeridas.
```

**Banderas que causan MEDIO:**
- En quincena (10 pts)
- Calificación ≤5 (15 pts)
- >120 días vencidos (15 pts)

**Qué hacer:**
1. Monitorear tendencias
2. Incluir en reportes mensuales
3. Sin acciones inmediatas

---

### Nivel BAJO (Score <20)
**Qué significa:** Operaciones normales, registro estadístico

**Ejemplo de alerta:**
```
✓ No se detectaron anomalías significativas en el periodo analizado.

Total operaciones: 847
Anomalías menores: 12 (1.4%)
Promedio diario: 282 disposiciones
Rango normal esperado: 250-320

Sistema operando dentro de parámetros normales.
```

**Qué hacer:**
1. Registrar métricas
2. Sin acciones requeridas

---

## 💬 Cómo Interactuar con el Agente

### 1. Análisis Inicial

**Tú:**
```
Agent_disp_BQ analiza disposiciones últimos 3 días
```

**Agente:**
```
Analizando disposiciones últimos 3 días...
✓ 847 disposiciones obtenidas
✓ Calculando scores de riesgo...
⚠️ 23 anomalías detectadas

🔴 2 ALERTA(S) CRÍTICA(S)
🟡 8 caso(s) de riesgo ALTO
🟢 13 caso(s) de riesgo MEDIO

[Análisis detallado...]

¿Deseas que profundice en algún caso específico?
```

---

### 2. Profundizar en un Caso

**Tú:**
```
Sí, profundiza en el caso crítico del empleado #4521
```

**Agente:**
```
Ejecutando análisis forense del empleado #4521...

[Consulta BigQuery histórico 30 días]

Hallazgos:
- 127 disposiciones procesadas en marzo 2026
- 23 de ellas (18%) con banderas de riesgo
- Patrón repetido: Operaciones fuera de horario (14 casos)
- 8 clientes comparten mismo teléfono

Mecánica del fraude detectada:
[Análisis paso a paso...]

Recomendaciones ejecutivas:
1. Suspensión preventiva
2. Auditoría forense completa
3. Revisión de otros empleados con patrón similar

¿Quieres que analice empleados con patrón similar?
```

---

### 3. Análisis Comparativo

**Tú:**
```
Compara esta semana con la semana anterior
```

**Agente:**
```
Comparando semanas...

Semana actual (22-28 Mar):
- 847 disposiciones
- 23 anomalías (2.7%)
- 2 casos críticos

Semana anterior (15-21 Mar):
- 823 disposiciones
- 12 anomalías (1.5%)
- 0 casos críticos

Cambios significativos:
- ↑ 92% en anomalías detectadas
- ↑ 2 casos críticos nuevos
- ↑ Actividad sucursal 127 (+34%)

Recomendación: Investigar sucursal 127
```

---

### 4. Análisis por Filtros

**Tú:**
```
Analiza solo la sucursal 127 últimos 7 días
```

**Agente:**
```
[Ejecuta query filtrada por sucursal 127]

Sucursal 127 - Análisis 7 días:
- 94 disposiciones
- 12 anomalías (12.8% - ALTO comparado con promedio 2.5%)
- 1 caso crítico

Empleados involucrados:
- #4521: 8 operaciones anómalas
- #2834: 3 operaciones anómalas
- #7721: 1 operación anómala

Patrón dominante: Colusión empleado-cliente

[Análisis detallado...]
```

---

### 5. Solicitar Reporte Ejecutivo

**Tú:**
```
Dame un reporte ejecutivo para el Comité de Auditoría
```

**Agente:**
```
Generando reporte ejecutivo...

REPORTE EJECUTIVO - ANÁLISIS PREDICTIVO DE FRAUDES
Periodo: 22-28 Marzo 2026
Preparado para: Comité de Auditoría FINDEP

RESUMEN EJECUTIVO:
Se detectaron 2 casos críticos de fraude...

IMPACTO FINANCIERO:
- Monto en riesgo: $127,400 MXN
- Operaciones afectadas: 8
- Periodo: 25-27 Marzo 2026

RECOMENDACIONES PRIORITARIAS:
1. Acción inmediata: Suspensión empleado #4521
2. Investigación forense: Sucursal 127
3. Controles preventivos: [...]

[Reporte completo en formato ejecutivo...]
```

---

## 🎯 Qué Más Puedes Hacer

### Análisis Específicos

**Por Periodo:**
```
Agent_disp_BQ analiza últimos 7 días
Agent_disp_BQ analiza última quincena
Agent_disp_BQ analiza este mes
```

**Por Entidad:**
```
Agent_disp_BQ analiza sucursal 127 última semana
Agent_disp_BQ analiza empleado #4521 último mes
Agent_disp_BQ analiza contrato CTR-88945
```

**Por Tipo de Riesgo:**
```
Agent_disp_BQ detecta colusión empleado-cliente
Agent_disp_BQ busca fraccionamiento últimos 5 días
Agent_disp_BQ encuentra operaciones fuera de horario
```

### Reportes y Tendencias

```
Agent_disp_BQ tendencias última semana
Agent_disp_BQ reporte mensual marzo 2026
Agent_disp_BQ comparación mes actual vs anterior
Agent_disp_BQ top 10 sucursales con más riesgo
```

### Investigaciones

```
Agent_disp_BQ investiga empleado #4521
Agent_disp_BQ histórico sucursal 127 último trimestre
Agent_disp_BQ casos similares a [descripción]
```

### Seguimiento

```
Agent_disp_BQ estado del caso [ID]
Agent_disp_BQ seguimiento empleado #4521
Agent_disp_BQ evolución riesgos última semana
```

---

## 📊 Datos que Analiza

El agente tiene acceso a:

### BigQuery Datasets
- ✅ Disposiciones (CAJA_UNICA.disposicion)
- ✅ Validaciones OTP (CAJA_UNICA.validacion_otp)
- ✅ Empleados (DATA_OPERATIVA.plantilla_empleados)
- ✅ Clientes (DATA.evolucion_diaria_clientes)
- ✅ Líneas de crédito (DATA.evolucion_diaria_lineas_credito)
- ✅ Sucursales (BUO_FISA.c_sucursales_convergencia)

### Datos Enriquecidos
- Calificación cliente
- Días vencidos
- Capital insoluto
- Historial de pagos
- Datos demográficos
- Información empleado

---

## ⚙️ Configuración del Sistema

### Umbrales Actuales

```python
CRITICAL_THRESHOLD = 80   # Score ≥80 → CRÍTICO
HIGH_THRESHOLD = 40       # Score ≥40 → ALTO
MEDIUM_THRESHOLD = 20     # Score ≥20 → MEDIO
# Score <20 → BAJO
```

### Banderas Activas (13)

| Bandera | Puntos | Nivel |
|---------|--------|-------|
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

### LLM Usado

**Actual:** Solo Gemini 2.5 Flash (gratis)
**Opcional:** Claude Opus 4.6 para casos críticos (después de configurar)

---

## 💡 Tips de Uso

### 1. Briefing Matutino
```
Agent_disp_BQ briefing de riesgos últimas 24 horas
```

### 2. Reporte Semanal
```
Agent_disp_BQ reporte semanal completo
```

### 3. Alertas Críticas
```
Agent_disp_BQ ¿hay casos críticos hoy?
```

### 4. Seguimiento de Caso
```
Agent_disp_BQ status del caso crítico empleado #4521
```

### 5. Comparación Histórica
```
Agent_disp_BQ compara esta semana con promedio histórico
```

---

## 📱 Notificaciones

El sistema **NO envía notificaciones automáticas**. Debes:

1. **Invocarlo manualmente** cuando necesites
2. **Programar análisis** (ver sección siguiente)
3. **Revisar logs** en `Agent_disp_BQ_resources/logs/`

### Programar Análisis Diario (Opcional - Fase 2)

Puedes crear un cron job o scheduled task:

```bash
# Windows Task Scheduler
# Ejecutar diariamente a las 8:00 AM
python Agent_disp_BQ_resources/analyzer.py > briefing_diario.txt
```

---

## 🔐 Protección de Datos

El agente:
- ✅ **NUNCA expone** nombres completos de clientes
- ✅ **NUNCA expone** teléfonos completos
- ✅ **NUNCA expone** CURP, RFC
- ✅ Usa solo **identificadores** (números de empleado, contratos)
- ✅ Logs encriptados en `logs/`

---

## 📞 Soporte

**Problemas técnicos:**
1. Revisar: `Agent_disp_BQ_resources/README.md`
2. Revisar: `Agent_disp_BQ_resources/COMO_AGREGAR_CLAUDE.md`
3. Ejecutar: `python test_agent_predictivo.py`

**Ajustes de umbrales:**
- Editar: `Agent_disp_BQ_resources/.env`
- Cambiar: `CRITICAL_THRESHOLD`, `HIGH_THRESHOLD`, etc.

**Agregar Claude:**
```bash
python setup_claude_key.py
```

---

## 🚀 Inicio Rápido - Mañana

**Paso 1:** Abre Claude Code

**Paso 2:** Escribe:
```
Agent_disp_BQ analiza disposiciones últimos 3 días
```

**Paso 3:** Lee el análisis

**Paso 4:** Interactúa según necesites:
- Profundizar en casos
- Solicitar reportes
- Hacer seguimiento

**Paso 5:** Toma decisiones basadas en evidencia

---

**¡Listo! El sistema está a tu disposición 24/7.**

Usa el agente como tu **analista de fraudes siempre disponible**.

---

*Última actualización: 29 de Marzo, 2026*
*Heriberto Galvez - hgalvezb@findep.com.mx*
