# Spec: Pestana "Seguimiento de Incidencias y Fallas a los Controles"

**Fecha:** 2026-03-21
**Proyecto:** Monitor de Disposiciones (bd_Agent_Disp)
**Version destino:** v5.0
**Archivos afectados:** `gas-optimizado/codigo.gs`, `gas-optimizado/Dashboard.html`

---

## 1. Objetivo

Agregar la pestana 7 al Monitor de Disposiciones que implementa el flujo completo del diagrama del Agente de Disposiciones con dos tracks paralelos:

1. **Controles (C-535):** Flags con normativa formal. Flujo: Deteccion → Analisis → Confirmacion → Asignacion a coordinador ARO → Investigacion → Dictamen (fraude/incumplimiento/mala practica) → Accion (auditoria/sancion/correo GZ) → Reporte final.
2. **Warnings:** Flags de monitoreo sin control formal. Flujo: Deteccion → Analisis suma de alertas por contrato → Priorizacion → Asignacion a coordinador → Investigacion → Reporte.

Incluye simulacion interactiva del diagrama de flujo (SVG) y gestion Kanban de eventos.

---

## 2. Clasificacion de Flags

### 2.1 Controles (con normativa C-535)

| Col letras | Nombre del flag | Control normativo |
|------------|----------------|-------------------|
| CQ | C-535 Validacion presencia | Gerente valida presencia e ingresa credenciales |
| CU | Disposiciones Foraneas | Solo cheque ≤$10K + confirmacion sucursal origen |
| CV | Calificacion ≤5 | No disponer efectivo (excepto calif 1 o 0) |
| DC | Excede $24K/dia | Excedente solo via cheque |
| CX | Tel repetido +2 contratos | Lista negra telefonos bloqueados |
| CY | Tel de colaborador | Lista negra telefonos personal |

### 2.2 Warnings (monitoreo)

Todas las columnas en CR1:DD1 que NO sean CQ, CU, CV, DC, CX, CY. Incluyen:
- Fuera de horario, +1 mismo dia, Contratos <3 min, Pago SPEI Colab
- Reversos, Monto duplicado, Dormidas >120 dias, Quincenales
- Disposiciones >$1,000 sin autorizacion

### 2.3 Columna DG — Evento

Campo descriptivo adicional del evento. Se incluye como contexto cuando existe.

### 2.4 Deteccion automatica

Las columnas warning se identifican en runtime: todo flag en `CR1:DD1` cuyo indice de columna NO corresponda a CQ, CU, CV, DC, CX, CY.

---

## 3. Modelo de Datos

### 3.1 Nueva hoja: `_seguimiento_eventos`

| Col | Campo | Tipo | Descripcion |
|-----|-------|------|-------------|
| A | ID | String | Auto: `EVT-YYYYMMDD-NNNN` |
| B | Fecha_Deteccion | Date | Timestamp de creacion |
| C | Tipo | String | `CONTROL` o `WARNING` |
| D | Categoria | String | Nombre del flag especifico |
| E | Sucursal | String | Sucursal del evento |
| F | Contrato | String | Numero de contrato |
| G | Folio | String | Folio de la disposicion |
| H | Monto | Number | Monto de la operacion |
| I | Etapa | String | Estado en el flujo (ver 3.2) |
| J | Confirmado | String | `SI` / `NO` / `PENDIENTE` |
| K | Tipo_Hallazgo | String | `MALA_PRACTICA` / `FRAUDE` / `INCUMPLIMIENTO` / `FALSO_POSITIVO` |
| L | Asignado_A | String | Email del coordinador/ARO |
| M | Suma_Alertas | Number | Conteo total de flags para ese contrato |
| N | Prioridad | String | `CRITICA` / `ALTA` / `MEDIA` / `BAJA` |
| O | Notas | String | Texto libre del analisis |
| P | Fecha_Actualizacion | Date | Ultima modificacion |
| Q | Registrado_Por | String | Email del usuario |
| R | Columna_Origen | String | Ref a la columna del flag (CQ, CU, etc.) |
| S | Evento_DG | String | Valor de columna DG del registro original |

### 3.2 Etapas del flujo

```
DETECTADO → EN_ANALISIS → CONFIRMADO → ASIGNADO → EN_INVESTIGACION → DICTAMINADO → CERRADO
                        ↘ CERRADO (descartado / falso positivo)
```

Transiciones validas:
- DETECTADO → EN_ANALISIS
- EN_ANALISIS → CONFIRMADO | CERRADO (falso positivo)
- CONFIRMADO → ASIGNADO
- ASIGNADO → EN_INVESTIGACION
- EN_INVESTIGACION → DICTAMINADO
- DICTAMINADO → CERRADO
- CERRADO → DETECTADO (solo reabrir por admin)

### 3.3 Calculo de prioridad

Basado en suma de alertas del contrato:
- **CRITICA:** ≥5 flags activas o cualquier flag de Tel colaborador o Tel repetido
- **ALTA:** 3-4 flags activas
- **MEDIA:** 2 flags activas
- **BAJA:** 1 flag activa

---

## 4. Backend (codigo.gs)

### 4.1 Constantes

```javascript
var SEGUIMIENTO_SHEET = '_seguimiento_eventos';
var SEGUIMIENTO_HEADERS = [
  'ID','Fecha_Deteccion','Tipo','Categoria','Sucursal','Contrato','Folio',
  'Monto','Etapa','Confirmado','Tipo_Hallazgo','Asignado_A','Suma_Alertas',
  'Prioridad','Notas','Fecha_Actualizacion','Registrado_Por','Columna_Origen','Evento_DG'
];

// Columnas que son CONTROLES (las demas son WARNINGS)
var CONTROL_COLUMNS = ['CQ','CU','CV','DC','CX','CY'];
```

Agregar `SEGUIMIENTO_SHEET` a `CONFIG`.

### 4.2 Funciones de pre-computo

**`computeSeguimientoData_(allData, COL, flagColNames, flagStartIdx, ss)`**

Ejecutada dentro de `precomputeAll()`. Calcula:

1. Cuantificacion por flag: eventos activos, % del universo
2. Clasificacion CONTROL vs WARNING por flag
3. Contadores por etapa desde `_seguimiento_eventos`
4. Suma de alertas por contrato
5. Datos para nodos del diagrama SVG (contadores, tiempos promedio)

Retorna objeto `seguimiento` agregado al JSON del cache.

**`autoDetectNewEvents_(allData, COL, flagColNames, flagStartIdx, ss)`**

Ejecutada dentro de `precomputeAll()`:

1. Lee eventos existentes de `_seguimiento_eventos`
2. Construye set de llaves existentes: `contrato|folio|flag`
3. Recorre `allData` buscando flags activas sin evento
4. Crea nuevos eventos en estado DETECTADO
5. Calcula Suma_Alertas y Prioridad por contrato
6. Escribe batch en la hoja

Limite: max 100 nuevos eventos por ejecucion (para no exceder tiempo del trigger).

### 4.3 Funciones CRUD

| Funcion | Params | Retorna | Descripcion |
|---------|--------|---------|-------------|
| `ensureSeguimientoSheet_()` | ss | sheet | Crea hoja si no existe |
| `getSeguimientoEvents(filtrosJson)` | JSON string | JSON string | Lee eventos con filtros (tipo, etapa, prioridad, sucursal) |
| `updateEventoEtapa(eventoId, nuevaEtapa, datosJson)` | string, string, JSON | JSON string | Valida transicion y actualiza etapa |
| `getEventoDetalle(eventoId)` | string | JSON string | Detalle completo de un evento |
| `getSeguimientoKPIs()` | — | JSON string | KPIs y porcentajes para zona 1 |
| `getDiagramaData()` | — | JSON string | Contadores por nodo para SVG |
| `asignarEvento(eventoId, emailAsignado)` | string, string | JSON string | Asigna y mueve a ASIGNADO |
| `dictaminarEvento(eventoId, tipoHallazgo, notas)` | string, string, string | JSON string | Registra dictamen |

### 4.4 Validacion de transiciones

`updateEventoEtapa` valida:
- Que la transicion sea permitida (mapa de transiciones)
- Que los campos requeridos esten presentes segun la etapa destino
- Que el usuario tenga permiso (cualquier usuario autorizado puede avanzar)

### 4.5 Integracion con agente Gemini

`getAnalysisContext()` en Dashboard.html se enriquece con:
- Eventos por etapa (cuantos en cada fase del flujo)
- Top controles con mayor % de falla
- Top warnings por frecuencia
- Eventos vencidos (>48h sin avance)
- Distribución control vs warning

---

## 5. Frontend (Dashboard.html)

### 5.1 Estructura general

La pestana 7 se agrega al array de tabs existente. Su contenido se divide en 4 zonas:

### 5.2 Zona 1 — Panel de Cuantificacion

**Fila superior:** 6 KPI cards horizontales:
- Universo total de disposiciones
- Total controles activados (count + %)
- Total warnings activados (count + %)
- Disposiciones limpias (count + %)
- Eventos en seguimiento activo
- Eventos cerrados

**Dos tablas lado a lado:**

Tabla izquierda (fondo naranja suave `#fff3e0`): Lista de CONTROLES con columnas: Nombre, Eventos, % Universo, En Seguimiento, Control Normativo.

Tabla derecha (fondo amarillo suave `#fff8e1`): Lista de WARNINGS con columnas: Nombre, Eventos, % Universo, En Seguimiento.

Cada fila clickeable → filtra diagrama y Kanban.

### 5.3 Zona 2 — Diagrama de Flujo SVG

SVG inline generado con datos reales. Replica el diagrama del PDF del Agente de Disposiciones.

**Estructura del SVG:**

Dos carriles (swimlanes):
- Carril CONTROLES (naranja): Deteccion → Controles C-535 → Analisis causa → ¿Confirmado? → Si: Reporte a coordinador ARO → ¿Se confirma? → Si: Tipo informe → Fraude/Incumplimiento/Mala practica → Acciones
- Carril WARNINGS (amarillo): Deteccion → Warnings → Analisis suma alertas → Priorizacion → Asignacion coordinador → ¿Confirmado? → Si: Reporte → Acciones

**Nodos del diagrama:**
- Rectangulo redondeado con texto + contador
- Color de fondo segun volumen: verde (<10), amarillo (10-49), naranja (50-99), rojo (≥100)
- Click en nodo → filtra Kanban por esa etapa
- Hover → tooltip con: % del total, tiempo promedio en etapa, tendencia
- Pulso CSS animado en nodos con eventos pendientes >24h

**Flechas:**
- SVG `<line>` o `<path>` con `marker-end` para puntas de flecha
- Grosor proporcional al volumen de eventos que fluyen por esa ruta
- Color: gris para flujo normal, rojo para flujo con eventos criticos

**Diamantes de decision:**
- `<polygon>` rotado 45deg con texto "¿Confirmado?" / "¿Incidencia?"
- Dos salidas: SI (continua) y NO (desvio a cerrado/actualizar criterios)

### 5.4 Zona 3 — Kanban de Seguimiento

7 columnas horizontales scrolleables representando las etapas:

`DETECTADO | EN ANALISIS | CONFIRMADO | ASIGNADO | EN INVESTIGACION | DICTAMINADO | CERRADO`

Cada columna muestra:
- Header con nombre de etapa + contador badge
- Cards de eventos scrolleables verticalmente (max-height con overflow)

**Card del evento:**
- Header: ID + badge de prioridad (color)
- Tipo: badge CONTROL (naranja) o WARNING (amarillo)
- Categoria: nombre del flag
- Sucursal + Contrato + Monto
- Tiempo en etapa: badge verde (<24h), amarillo (24-48h), rojo (>48h)
- Boton de accion primaria para avanzar a siguiente etapa
- Boton secundario para descartar (solo en EN_ANALISIS)

**Acciones por etapa (boton en la card):**

| Etapa actual | Boton | Accion | Campos requeridos |
|-------------|-------|--------|-------------------|
| DETECTADO | "Analizar" | → EN_ANALISIS | — |
| EN_ANALISIS | "Confirmar" | → CONFIRMADO | Notas (textarea) |
| EN_ANALISIS | "Descartar" | → CERRADO | Notas (obligatorio) |
| CONFIRMADO | "Asignar" | → ASIGNADO | Email asignado (input) |
| ASIGNADO | "Investigar" | → EN_INVESTIGACION | — |
| EN_INVESTIGACION | "Dictaminar" | → DICTAMINADO | Tipo_Hallazgo (select) + Notas |
| DICTAMINADO | "Cerrar" | → CERRADO | Accion tomada (textarea) |

Al hacer click en el boton, se abre un mini-modal inline (dentro de la card) con los campos requeridos y boton Guardar/Cancelar. Usa `google.script.run` para llamar al backend.

### 5.5 Zona 4 — Tabla de Detalle

Tabla paginada server-side (reusa patron de `getTablePage`).

Filtros: Tipo (Control/Warning), Categoria (select), Etapa (select), Prioridad (select), Sucursal (select), Asignado (select).

Columnas: ID, Fecha, Tipo, Categoria, Sucursal, Contrato, Monto, Etapa, Prioridad, Asignado, Dias en etapa, Suma Alertas.

Boton de exportacion a Google Sheet (reusa `exportSectionToSheet`).

### 5.6 Integracion con contexto del agente

En `getAnalysisContext()` se agrega seccion `## Seguimiento de Eventos`:
- Contadores por etapa
- Top 5 controles con mayor % de falla
- Top 5 warnings mas frecuentes
- Eventos criticos pendientes >48h
- Ratio control vs warning

---

## 6. Integracion con precomputeAll()

El flujo dentro de `precomputeAll()` se extiende:

```
1. [existente] Lee datos, single-pass, KPIs, charts, risks, filters
2. [existente] Compute executive, predictive, historic
3. [NUEVO] autoDetectNewEvents_() — crea eventos DETECTADO para flags nuevas
4. [NUEVO] computeSeguimientoData_() — calcula KPIs, contadores, diagrama
5. [existente] Guarda todo en cache JSON
```

El objeto `seguimiento` se agrega al JSON del cache junto a `kpis`, `charts`, `risks`, `predictive`, etc.

---

## 7. Restricciones y limites

- **Max 100 nuevos eventos por ejecucion** del trigger (para no exceder 6 min)
- **Paginacion** en Kanban: max 20 cards por columna (scroll para ver mas)
- **Paginacion** en tabla: 50 rows por pagina (igual que tabla existente)
- **No eliminar eventos** — solo cerrar (trazabilidad completa)
- **No retroceder etapas** — excepto reabrir CERRADO → DETECTADO por admin
- **Sin dependencias externas** — SVG puro, CSS puro, sin librerias JS

---

## 8. Diagrama de flujo del SVG — Nodos

Lista de nodos para el SVG con sus coordenadas relativas:

### Carril Controles (y=0 a y=50%)
1. `deteccion_ctrl` — "Deteccion Controles" (inicio)
2. `controles_c535` — "Controles C-535" (lista de 6 controles)
3. `analisis_causa` — "Analisis causa y validacion a nivel contrato"
4. `decision_confirma_ctrl` — "¿Se confirma incidencia?" (diamante)
5. `reporte_coord_aro` — "Se reporta a coordinador ARO"
6. `decision_confirma_coord` — "¿Se confirma incidencia?" (diamante)
7. `actualiza_criterios` — "Se actualizan criterios de alerta" (si NO)
8. `tipo_informe` — "Tipo de informe" (bifurcacion)
9. `fraude` — "Mala practica / Fraude"
10. `incumplimiento` — "Incumplimiento"
11. `reporte_auditoria` — "Reporte a Auditoria"
12. `consulta_sanciones` — "Consulta Matriz de sanciones"
13. `aplica_sancion` — "Aplica: Retro / Acta admin"
14. `correo_gz` — "Correo a Gerente de Zona"
15. `informe_revision` — "Informe de Revision Especial"
16. `seguimiento_planes` — "Seguimiento a planes de accion"
17. `reporte_final` — "Reporte Final"

### Carril Warnings (y=50% a y=100%)
18. `deteccion_warn` — "Deteccion Warnings" (inicio)
19. `warnings_list` — "Warnings" (lista de flags warning)
20. `analisis_suma` — "Analisis suma total alertas por contrato"
21. `priorizacion` — "Prioridad por suma de alertas"
22. `asignacion_coord` — "Asignacion a coordinacion para investigacion"
23. `decision_confirma_warn` — "¿Se confirma incidencia?" (diamante)
24. `reporte_dictamen` — "Reporte dictamen y analisis por correo"
25. `cerrado_warn` — "Fin" (cerrado)

---

## 9. Resumen de cambios por archivo

### codigo.gs
- Agregar constantes: `SEGUIMIENTO_SHEET`, `SEGUIMIENTO_HEADERS`, `CONTROL_COLUMNS`
- Agregar a CONFIG: `SEGUIMIENTO_SHEET: '_seguimiento_eventos'`
- Nueva funcion: `ensureSeguimientoSheet_()`
- Nueva funcion: `autoDetectNewEvents_()`
- Nueva funcion: `computeSeguimientoData_()`
- Nueva funcion: `getSeguimientoEvents()`
- Nueva funcion: `updateEventoEtapa()`
- Nueva funcion: `getEventoDetalle()`
- Nueva funcion: `getSeguimientoKPIs()`
- Nueva funcion: `asignarEvento()`
- Nueva funcion: `dictaminarEvento()`
- Modificar: `precomputeAll()` — agregar pasos 3 y 4
- Modificar: `setupTrigger()` — crear hoja seguimiento

### Dashboard.html
- Agregar pestana 7 en el array de tabs
- Agregar funcion `renderTabSeguimiento(data)`
- Agregar funcion `renderDiagramaSVG(diagramaData)`
- Agregar funcion `renderKanban(kanbanData)`
- Agregar funciones de interaccion: `avanzarEvento()`, `descartarEvento()`, `asignarEventoUI()`, `dictaminarEventoUI()`
- Agregar estilos CSS para SVG, Kanban, cards, animaciones
- Modificar `getAnalysisContext()` — agregar datos de seguimiento

---

## 10. No incluido en esta version

- Notificaciones por email cuando un evento cambia de etapa
- Historial/log de cambios por evento (audit trail)
- Dashboard de productividad por coordinador/ARO
- Integracion con BigQuery para datos historicos
- Generacion automatica de Informe de Revision Especial en Google Docs
