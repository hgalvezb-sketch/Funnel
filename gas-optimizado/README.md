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

1. flagStartIdx apuntaba a columnas incorrectas (CRITICO)
2. Cache JSON chunked para >50K chars/celda (CRITICO)
3. Busqueda general no implementada en getTablePage (MEDIO)
4. HTML injection via </script> en JSON embebido (MEDIO)
5. Funciones JS faltantes + chat history + contexto Gemini mejorado

## Ultimo commit

- Branch: feature/monitor-chat-agent
- Fecha: 2026-03-16

## Puntos de restauracion

| Version | Commit | Restaurar |
|---------|--------|-----------|
| v5 - CSV Analyzer | d0d020e | `git checkout d0d020e` |
| v4 - CORS Fix | 442ef1b | `git checkout 442ef1b` |
| v3 - Google Drive | 97957af | `git checkout 97957af` |
| v2 - Colors | d1c20c1 | `git checkout d1c20c1` |
| v1 - Initial | b56eb40 | `git checkout b56eb40` |
