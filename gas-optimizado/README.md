# Monitor de Disposiciones - FINDEP

Dashboard de monitoreo de disposiciones de Caja Unica para FINDEP. Google Apps Script Web App con arquitectura de pre-agregacion server-side y agente de analisis con Gemini AI.

## URLs del proyecto

| Recurso | URL |
|---------|-----|
| **Dashboard (ejecutable)** | https://script.google.com/a/macros/findep.com.mx/s/AKfycbwbCF2EtDit2Azfhrl5OBqCOCh6il_WdL7s-vmgaV6fK4RgChVWpkQmMm5-IpfUZr5G/exec |
| **Editor Apps Script** | https://script.google.com/u/0/home/projects/1QAejn9u7S4N52ddZd9FB4CHviJIxLjO2-RorT0LtKaHwmz06VsxPUgyr/edit |
| **Spreadsheet** | https://docs.google.com/spreadsheets/d/1ADKcPFVvHUlLtR2x_A5f74rdJOZa73p3gEwPq_E338I/edit |
| **GitHub repo** | https://github.com/hgalvezb-sketch/Funnel |
| **Branch activo** | `feature/monitor-chat-agent` |

## Arquitectura

```
[Trigger cada 10 min] -> [Pre-calcula 50k+ filas] -> [Cache JSON chunked]
[Usuario abre URL]    -> [Lee cache ~200KB]        -> [Renderiza en 3-5 seg]
[Filtros/Tabla]       -> [Server-side via google.script.run] -> [Re-agrega desde slim sheet]
[Chat con Agente]     -> [Gemini 2.0 Flash + systemInstruction + historial] -> [Respuesta contextual]
```

## Archivos

- `gas-optimizado/codigo.gs` - Backend Apps Script (pre-agregacion, filtros, tabla paginada, chat Gemini)
- `gas-optimizado/Dashboard.html` - Frontend (10 graficas, 6 KPIs, 8 filtros, analisis de riesgos, chat IA, tabla paginada)

## Agente de Chat - Gemini AI

El dashboard incluye un agente de analisis de fraude y riesgos operativos integrado con Gemini 2.0 Flash.

### Funcionalidades del agente
- **System prompt FINDEP** con contexto de microfinanzas y 13 banderas de riesgo con severidades (ALTA/MEDIA/BAJA)
- **`systemInstruction`** como campo separado del payload Gemini (no concatenado en contents)
- **Historial multi-turno** (ultimos 6 mensajes via `chatHistory`)
- **Contexto dinamico** enriquecido: KPIs actuales, filtros activos, riesgos detectados, top 5 sucursales de riesgo, banderas activas
- **4 preguntas sugeridas** con botones clickeables
- **Boton "Limpiar"** para reiniciar conversacion
- **Renderizado markdown** en respuestas (negritas, listas, headers con colores)
- **Temperature 0.4** para respuestas deterministas en contexto financiero

### 13 Banderas de riesgo monitoreadas

| Severidad | Banderas |
|-----------|----------|
| **ALTA** | Fuera de horario, +1 mismo dia, Tel repetido distintos contratos, Tel de Colaborador, Contratos en menos de 3 min, Pago SPEI Colab |
| **MEDIA** | Foraneas efectivo, Monto duplicado mismo dia, Disposiciones >24k, REVERSADO |
| **BAJA** | > 120 dias, Calificacion <= 5, En Quincena |

## Despliegue

### Paso a paso
1. Abrir el **Editor de Apps Script** (URL arriba)
2. Seleccionar **Codigo.gs** > Ctrl+A > pegar contenido de `gas-optimizado/codigo.gs`
3. Seleccionar **Dashboard.html** > Ctrl+A > pegar contenido de `gas-optimizado/Dashboard.html`
4. Guardar con **Ctrl+S**
5. Ejecutar `setupTrigger()` una vez (menu Ejecutar)
6. **Implementar > Administrar implementaciones > Editar > Nueva version > Implementar**

### Configurar API Key de Gemini (requerido para el chat)
1. En el Editor de Apps Script: **Configuracion** (engranaje) > **Propiedades de script**
2. Agregar propiedad: `GEMINI_API_KEY`
3. Obtener key en: https://aistudio.google.com/apikey
4. La key tiene formato `AIzaSy...` (NO confundir con Client Secret `GOCSPX-...`)
5. Guardar

### Errores comunes del chat
| Error | Causa | Solucion |
|-------|-------|----------|
| "API Key de Gemini no configurada" | Falta la propiedad de script | Agregar `GEMINI_API_KEY` en Propiedades de script |
| "You exceeded your current quota" | Cuota gratuita agotada | Crear nueva API key en proyecto GCP nuevo via aistudio.google.com/apikey, o habilitar facturacion |
| "Respuesta inesperada de Gemini" | Error de API | Verificar que la key sea valida y el modelo `gemini-2.0-flash` este disponible |

## Agente BigQuery (CLI)

Ademas del chat en el dashboard, existe un agente de BigQuery para analisis desde terminal:

```bash
# Invocar desde Claude Code
/agent bigquery-analyst ¿Cuantas disposiciones hubo esta semana?
```

- **Archivo:** `.claude/agents/bigquery-analyst.md`
- **Dataset:** `ws-ctrol-interno.CAJA_UNICA.disposicion`
- **Uso:** Consultas SQL directas a BigQuery sobre disposiciones, sucursales, anomalias

## Bugs corregidos (2026-03-16)

### Ronda 1 - Analisis inicial
1. flagStartIdx apuntaba a columnas incorrectas (CRITICO)
2. Cache JSON chunked para >50K chars/celda (CRITICO)
3. Busqueda general no implementada en getTablePage (MEDIO)
4. HTML injection via `</script>` en JSON embebido (MEDIO)
5. Funciones JS faltantes + chat history + contexto Gemini mejorado

### Ronda 2 - Revision por Agent Team (2 agentes expertos)
6. 7 vulnerabilidades XSS: tabla, headers, riesgos, chat, errores
7. Montos negativos (reversiones) ahora en categoria "Negativo"
8. Edades invalidas (<18) ahora en categoria "N/D"
9. Gauge max dinamico (se ajusta si tasa > 50%)
10. Batch read inteligente (individual si filas dispersas >10x)
11. CHAT_BUSY flag anti-doble-envio
12. Error handling para DB vacio en carga inicial
13. Package 'bar' no usado removido de Google Charts

### Ronda 3 - Mejoras de UX (2026-03-16)
14. Graficas responsivas con `getElSize()` y dimensiones dinamicas
15. Listener `window.resize` para redibujar graficas al cambiar tamano
16. Chart cards con flexbox (`display:flex; flex-direction:column`) para mejor distribucion

## Ultimo commit

- Branch: `feature/monitor-chat-agent`
- Commit: `a3a62a7`
- Fecha: 2026-03-16
- Para continuar en VS Code: `git checkout feature/monitor-chat-agent`

## Puntos de restauracion

| Version | Commit | Restaurar |
|---------|--------|-----------|
| **Monitor final (actual)** | `a3a62a7` | `git checkout feature/monitor-chat-agent` |
| Monitor pre-agentes | `d3ffaff` | `git checkout d3ffaff` |
| Monitor chat agent | `703832f` | `git checkout 703832f` |
| CSV Analyzer | `d0d020e` | `git checkout d0d020e` |
| CORS Fix | `442ef1b` | `git checkout 442ef1b` |
| Google Drive | `97957af` | `git checkout 97957af` |
| Colors | `d1c20c1` | `git checkout d1c20c1` |
| Initial | `b56eb40` | `git checkout b56eb40` |
