# Monitor de Disposiciones - Agente de Chat IA

## Proyecto Apps Script - FINDEP Caja Unica

Dashboard de monitoreo de disposiciones (desembolsos de credito) con analisis de fraude,
riesgos operativos y agente conversacional integrado con Gemini AI.

## URLs del Proyecto

| Recurso | URL |
|---------|-----|
| Dashboard (ejecutable) | https://script.google.com/a/macros/findep.com.mx/s/AKfycbwbCF2EtDit2Azfhrl5OBqCOCh6il_WdL7s-vmgaV6fK4RgChVWpkQmMm5-IpfUZr5G/exec |
| Apps Script Editor | https://script.google.com/u/0/home/projects/1QAejn9u7S4N52ddZd9FB4CHviJIxLjO2-RorT0LtKaHwmz06VsxPUgyr/edit |
| Spreadsheet (bd_disp) | https://docs.google.com/spreadsheets/d/1ADKcPFVvHUlLtR2x_A5f74rdJOZa73p3gEwPq_E338I/edit |

## Archivos

| Archivo | Destino en Apps Script | Descripcion |
|---------|----------------------|-------------|
| `codigo.gs` | Codigo.gs | Backend: pre-computacion, filtros, paginacion, chat Gemini |
| `Dashboard.html` | Dashboard.html | Frontend: KPIs, 10 graficas, analisis riesgos, chat, tabla |

## Arquitectura

```
[Trigger cada 10 min]
    |
    v
[precomputeAll()] --> Lee bd_disp completa, calcula todo en single pass
    |
    v
[Guarda en hojas ocultas: _dashboard_cache + _dashboard_slim]

[Usuario abre dashboard]
    |
    v
[doGet()] --> Lee datos pre-calculados (~100KB) --> Carga < 5 seg
    |
    v
[Filtros] --> getFilteredDashboard() --> Re-agrega datos slim
[Tabla]   --> getTablePage() --> Paginacion server-side (50 filas)
[Chat]    --> chatWithGemini() --> Gemini 2.0 Flash con contexto rico
```

## Funcionalidades del Chat (v2 - Actual)

- **System prompt enriquecido**: Contexto FINDEP, 13 banderas de riesgo con severidad (ALTA/MEDIA/BAJA)
- **Contexto dinamico rico**: KPIs, filtros activos, riesgos detectados, top sucursales, banderas activas
- **Historial de conversacion**: Multi-turno (ultimos 3 turnos), permite preguntas de seguimiento
- **Preguntas sugeridas**: 4 botones con consultas frecuentes
- **Renderizado markdown**: Bold, listas, headers con colores
- **Boton Limpiar**: Resetea conversacion y muestra sugerencias nuevamente
- **systemInstruction de Gemini**: Separado del contenido, temperature 0.4

## Como desplegar

1. Abre el [Apps Script Editor](https://script.google.com/u/0/home/projects/1QAejn9u7S4N52ddZd9FB4CHviJIxLjO2-RorT0LtKaHwmz06VsxPUgyr/edit)
2. Copia el contenido de `codigo.gs` al archivo **Codigo.gs**
3. Copia el contenido de `Dashboard.html` al archivo **Dashboard.html**
4. Guarda (Ctrl+S)
5. Ve a **Implementar > Administrar implementaciones > Editar** y crea nueva version
6. Ejecuta `setupTrigger()` una vez para activar la pre-computacion cada 10 min

### Configuracion del Chat

1. En el editor, ve a **Configuracion del proyecto** (icono engranaje)
2. En **Propiedades de script**, agrega:
   - Clave: `GEMINI_API_KEY`
   - Valor: tu API key de Google AI Studio (https://aistudio.google.com/apikey)

### Acceso via Monaco API (alternativa)

```javascript
// En la consola del Apps Script Editor:
const models = monaco.editor.getModels();
// models[0] = Codigo.gs
// models[1] = Dashboard.html
models[0].setValue(codigoGsContent);
models[1].setValue(dashboardHtmlContent);
// Ctrl+S para guardar
```

## Componentes del Dashboard

### KPIs (6)
Total Registros, Monto Total, Con Incidencias, Tasa Incidencia, Monto Promedio, Sucursales

### Graficas (10)
1. Registros por Sucursal Top 20
2. Monto por Sucursal Top 20
3. Distribucion por Rango de Monto
4. Distribucion por Edad
5. Tipos de Incidencia
6. Indicador de Riesgo Global (Gauge)
7. Tasa Incidencia por Sucursal Top 15
8. Promedio Monto por Sucursal Top 15
9. Banderas de Riesgo
10. Top Sucursales por Riesgo (Bubble)

### Filtros (8)
Sucursal, Contrato, Folio, Tipo Disp, Estatus, Incidencia, Calificacion, Empresa

### Banderas de Riesgo (13)
| Severidad | Banderas |
|-----------|----------|
| ALTA | Fuera de horario, +1 mismo dia, Tel repetido, Tel colaborador, Contratos <3 min, Pago SPEI colab |
| MEDIA | Foraneas efectivo, Monto duplicado, Disposiciones >24k, REVERSADO |
| BAJA | >120 dias, Calificacion <=5, En quincena |

## Continuidad en VS Code

Para continuar desarrollo en VS Code con Claude Code:

```bash
cd C:\Users\Administrador\Funnel
git checkout feature/monitor-chat-agent
# Editar archivos en gas-optimizado/
# Luego copiar al Apps Script Editor
```

## Historial de Versiones

| Version | Fecha | Descripcion | Restaurar |
|---------|-------|-------------|-----------|
| V4 (Editor) | 14 mar 2026 | Dashboard V2 con 10 graficas y analisis | En Apps Script: Implementar > Administrar > Version 4 |
| master | -- | Base estable del repo | `git checkout master` |
| feature/monitor-chat-agent | 16 mar 2026 | Chat mejorado con Gemini (esta version) | `git checkout feature/monitor-chat-agent` |
| feature/generic-csv-analyzer | 14 mar 2026 | Analizador CSV generico (POC) | `git checkout feature/generic-csv-analyzer` |

## Agente BigQuery (Claude Code)

Ademas del chat en el dashboard, existe un agente BigQuery configurado en Claude Code
que consulta directamente `ws-ctrol-interno.CAJA_UNICA.disposicion` para analisis profundos.

Invocacion: simplemente pregunta sobre disposiciones en Claude Code.
Configuracion: `~/.claude/agents/bigquery-analyst.md`
