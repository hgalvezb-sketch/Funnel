# Agente Gemini - Calculadora AI & CI & RO

Chat conversacional con Gemini embebido en la Calculadora de Riesgos de FINDEP.

## Setup

1. Abrir la Calculadora: https://docs.google.com/spreadsheets/d/14B1kpFukGQ0guGfYMmfnOInAi4TQDDjwla9dyFodavM
2. Extensions > Apps Script
3. Copiar el contenido de cada archivo .gs y sidebar.html al editor
4. O usar clasp:
   - Copiar el Script ID del editor (URL: /projects/SCRIPT_ID/edit)
   - Crear `.clasp.json`: `{"scriptId": "SCRIPT_ID", "rootDir": "."}`
   - `clasp push`
5. Configurar Script Properties: GEMINI_API_KEY
6. Recargar la hoja - aparecera el menu "AI Coach"

## Uso

- **Menu AI Coach > Abrir Chat**: Panel lateral conversacional
- **Analizar Tendencias**: Analisis de Historico CI y variables
- **Alertas de Riesgo**: Detecta valores fuera de rango en Var1-Var14
- **Generar Reporte**: Crea pestana con resumen ejecutivo
- **Sugerir Mejoras**: Propuestas de automatizacion y mejoras
