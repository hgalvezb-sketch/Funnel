# Agent_disp_BQ Predictivo - Cheat Sheet

**Guía Ultra-Rápida - Imprimir y tener a mano**

---

## 🚀 INICIO RÁPIDO

```
Agent_disp_BQ analiza disposiciones últimos 3 días
```

**¡Listo! El agente hace el resto.**

---

## 🎯 COMANDOS MÁS COMUNES

| Comando | Qué Hace |
|---------|----------|
| `Agent_disp_BQ analiza últimos 3 días` | Briefing rápido |
| `Agent_disp_BQ analiza última semana` | Análisis semanal |
| `Agent_disp_BQ briefing de riesgos` | Resumen ejecutivo |
| `Agent_disp_BQ ¿hay casos críticos?` | Check rápido |
| `Agent_disp_BQ analiza sucursal [NUM]` | Análisis por sucursal |
| `Agent_disp_BQ investiga empleado #[NUM]` | Análisis empleado |

---

## 🚨 NIVELES DE ALERTA

### 🔴 CRÍTICO (Score ≥80)
**Acción:** INMEDIATA (bloqueos, investigación)
**Ejemplos:** Colusión empleado-cliente, SPEI a colaborador

### 🟡 ALTO (Score 40-79)
**Acción:** 24-48 horas (validación, seguimiento)
**Ejemplos:** Fraccionamiento, operaciones fuera de horario

### 🟠 MEDIO (Score 20-39)
**Acción:** Monitoreo continuo
**Ejemplos:** Calificación baja, quincena

### 🟢 BAJO (Score <20)
**Acción:** Solo registro estadístico
**Ejemplos:** Operaciones normales

---

## 💬 INTERACCIÓN TÍPICA

**1. Invocar:**
```
Agent_disp_BQ analiza últimos 3 días
```

**2. Revisar alertas:**
```
🔴 2 CRÍTICAS
🟡 8 ALTAS
🟢 13 MEDIAS
```

**3. Profundizar:**
```
Profundiza en el caso del empleado #4521
```

**4. Solicitar reporte:**
```
Dame reporte ejecutivo para Comité de Auditoría
```

---

## 🎓 13 BANDERAS DE RIESGO

### Críticas (30-40 pts)
- ⚠️ Tel de Colaborador (35)
- ⚠️ Contratos <3min (35)
- ⚠️ Pago SPEI Colab (40)
- ⚠️ Monto duplicado (30)

### Altas (20-25 pts)
- ⚠️ +1 mismo día (25)
- ⚠️ Fuera horario (20)
- ⚠️ Foráneas efectivo (20)
- ⚠️ Tel repetido (25)

### Medias (10-15 pts)
- ⚠️ En quincena (10)
- ⚠️ Calificación ≤5 (15)
- ⚠️ >120 días (15)

### Bajas (10-12 pts)
- ⚠️ Disp >1K (10)
- ⚠️ Disp >24K (12)

---

## 📊 ANÁLISIS DISPONIBLES

### Por Tiempo
- `últimos 3 días` / `7 días` / `15 días`
- `última semana` / `última quincena` / `este mes`

### Por Entidad
- `sucursal [NUM]`
- `empleado #[NUM]`
- `contrato CTR-[NUM]`

### Por Tipo
- `detecta colusión`
- `busca fraccionamiento`
- `operaciones fuera de horario`

### Comparativos
- `compara esta semana vs anterior`
- `tendencias último mes`
- `top 10 sucursales con más riesgo`

---

## 💡 TIPS PRO

### Briefing Matutino (Lunes-Viernes)
```
Agent_disp_BQ briefing últimas 24 horas
```

### Reporte Semanal (Lunes)
```
Agent_disp_BQ reporte semanal completo
```

### Check Rápido
```
Agent_disp_BQ ¿casos críticos hoy?
```

### Deep Dive
```
Agent_disp_BQ investiga [entidad] último mes
```

---

## 📂 ARCHIVOS IMPORTANTES

| Archivo | Ubicación |
|---------|-----------|
| **Guía Completa** | `GUIA_RAPIDA_USO.md` |
| **Agregar Claude** | `COMO_AGREGAR_CLAUDE.md` |
| **README** | `README.md` |
| **Logs** | `logs/analisis_*.json` |
| **Costos** | `logs/usage_monthly.json` |

---

## 🔐 PROTECCIÓN DATOS

✅ **SÍ muestra:**
- Números de empleado (#4521)
- Números de contrato (CTR-88945)
- IDs de sucursal (127)
- Montos agregados

❌ **NO muestra:**
- Nombres completos
- Teléfonos completos
- CURP / RFC
- Datos personales sensibles

---

## 💰 COSTOS

**Actual (Solo Gemini):** ~$0.01/mes
**Con Claude (Opcional):** ~$3.60/mes

---

## 🆘 TROUBLESHOOTING

**Error de BigQuery:**
```bash
gcloud auth application-default login
```

**Error de configuración:**
```bash
python test_agent_predictivo.py
```

**Agregar Claude:**
```bash
python setup_claude_key.py
```

---

## 📞 CONTACTO RÁPIDO

**Heriberto Galvez**
hgalvezb@findep.com.mx

**Docs:** `Agent_disp_BQ_resources/`
**Spec:** `docs/superpowers/specs/...`

---

## 🎯 KEYWORDS QUE ACTIVAN MODO PREDICTIVO

- analiza / analizar
- anomalías / atípico
- riesgo / fraude
- briefing / alerta
- patrón / sospechoso
- detecta / predice

---

**VERSIÓN:** 1.0.0 | **FECHA:** 29-Mar-2026
**SISTEMA:** Gemini 2.5 Flash + BigQuery
**STATUS:** ✅ OPERATIVO

---

**¡GUARDA ESTE CHEAT SHEET!**
**Tu analista de fraudes 24/7 listo cuando lo necesites.**
