# Monitor de Disposiciones - FINDEP

Dashboard de monitoreo de disposiciones de Caja Unica para FINDEP. Google Apps Script Web App con arquitectura de pre-agregacion server-side.

## Arquitectura

```
[Trigger cada 10 min] -> [Pre-calcula 50k+ filas] -> [Cache JSON chunked]
[Usuario abre URL] -> [Lee cache ~200KB] -> [Renderiza en 3-5 seg]
[Filtros/Tabla] -> [Server-side via google.script.run] -> [Re-agrega desde slim sheet]
```

## Archivos

- `gas-optimizado/codigo.gs` - Backend Apps Script
- `gas-optimizado/Dashboard.html` - Frontend (10 graficas, KPIs, chat Gemini, tabla paginada)

## Despliegue

1. Copiar archivos al Editor de Apps Script
2. Configurar `GEMINI_API_KEY` en Propiedades de Script
3. Ejecutar `setupTrigger()` una vez
4. Implementar como Web App

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

## Ultimo commit

- Branch: feature/monitor-chat-agent
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
