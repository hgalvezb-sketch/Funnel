# Cómo Agregar Claude Opus 4.6 (Opcional)

El sistema está configurado para funcionar **perfectamente solo con Gemini 2.5 Flash**.

Claude Opus 4.6 es **opcional** y solo se necesita para análisis forense profundo de casos críticos (score ≥80).

---

## ¿Cuándo Agregar Claude?

Considera agregar Claude si:
- ✅ Necesitas análisis forense muy detallado de casos críticos
- ✅ Requieres recomendaciones ejecutivas para Comité de Auditoría
- ✅ Casos complejos requieren identificación de mecánica de fraude paso a paso
- ✅ Presupuesto disponible (~$3.60/mes con 20 análisis)

**NO necesitas Claude si:**
- ❌ Solo quieres detección rápida de anomalías (Gemini es suficiente)
- ❌ Screening diario de riesgos (Gemini cubre esto)
- ❌ Presupuesto limitado (Gemini es gratis hasta 15 RPM)

---

## Opción 1: Script Automático (Recomendado)

### Paso 1: Obtener API Key

1. Abre https://console.anthropic.com
2. Crea cuenta o inicia sesión
3. Menu lateral → **API Keys**
4. Click **Create Key**
   - Nombre: "Agent_disp_BQ_Predictivo"
5. **COPIA LA KEY** (solo se muestra una vez)
   - Formato: `sk-ant-api03-...`

### Paso 2: Configurar

Desde el directorio raíz del proyecto:

```bash
python setup_claude_key.py
```

El script:
- ✓ Valida el formato de la API key
- ✓ Actualiza `.env` automáticamente
- ✓ Cambia `FORCE_GEMINI_ONLY=false`
- ✓ Hace un test de configuración

---

## Opción 2: Manual

### Editar `.env`

Abre: `Agent_disp_BQ_resources/.env`

**Cambiar estas 2 líneas:**

```bash
# ANTES:
ANTHROPIC_API_KEY=sk-ant-PENDIENTE-ejecutar-setup_claude_key.py-cuando-sea-necesario
FORCE_GEMINI_ONLY=true

# DESPUÉS:
ANTHROPIC_API_KEY=sk-ant-api03-TU-API-KEY-AQUI
FORCE_GEMINI_ONLY=false
```

### Verificar configuración

```bash
cd Agent_disp_BQ_resources
python -c "from config import get_config; c=get_config(); print(f'Claude: {c.CLAUDE_MODEL}'); print(f'Key: {c.ANTHROPIC_API_KEY[:20]}...')"
```

---

## Comportamiento del Sistema

### Con FORCE_GEMINI_ONLY=true (actual)
```
Todos los análisis → Gemini 2.5 Flash
Costo: $0 (free tier)
```

### Con FORCE_GEMINI_ONLY=false (después de agregar Claude)
```
Score ≥80 (CRÍTICO)  → Claude Opus 4.6 (análisis forense)
Score 40-79 (ALTO)   → Gemini 2.5 Flash (screening)
Score <40            → Solo métricas

Costo: ~$0.18/análisis crítico
```

### Controles de Presupuesto

El sistema tiene protecciones automáticas:

1. **Confirmación antes de Claude:**
   ```
   Detecté 3 anomalías críticas (score=110).
   Análisis con Claude Opus 4.6 (costo ~$0.25).
   ¿Proceder? [C]laude / [G]emini / [S]kip:
   ```

2. **Límite mensual:**
   - Máximo: 20 llamadas/mes
   - Si se alcanza: fallback automático a Gemini

3. **Tracking de costos:**
   - Ver: `logs/usage_monthly.json`
   - Registro de cada análisis y costo acumulado

---

## Costos de Claude Opus 4.6

| Concepto | Precio |
|----------|--------|
| Input | $15 / 1M tokens |
| Output | $75 / 1M tokens |
| Análisis típico | ~$0.18 |
| Límite mensual (20) | ~$3.60/mes |

**Comparación:**
- Gemini: $0/mes (free tier)
- Claude: $3.60/mes (con 20 análisis críticos)

---

## Volver a Solo Gemini

Si después decides dejar de usar Claude:

```bash
# Editar Agent_disp_BQ_resources/.env
FORCE_GEMINI_ONLY=true
```

El sistema volverá a usar solo Gemini para todo.

---

## Recursos

- **Console Anthropic:** https://console.anthropic.com
- **Pricing Claude:** https://www.anthropic.com/pricing
- **Script setup:** `setup_claude_key.py`
- **Documentación:** `README.md`

---

**El sistema funciona perfectamente sin Claude. Solo agrégalo cuando lo necesites.**
