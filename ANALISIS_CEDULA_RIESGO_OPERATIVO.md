# Analisis Profundo: Cedula de Revision Riesgo Operativo V1/26

## 1. RESUMEN EJECUTIVO

La **Cedula de Revision Riesgo Operativo** es una herramienta de auditoria en Google Sheets que mide el nivel de riesgo operativo de las sucursales de FINDEP. Contiene **18 hojas** con un sistema de calificacion ponderada basado en **6 modulos de control**, donde los Asesores de Riesgo Operativo (AROs) evaluan el cumplimiento de procesos y controles en cada sucursal visitada.

El sistema tiene **23 archivos de Apps Script** que automatizan:
- Poblado de datos desde **9 spreadsheets externos** y **1 API de produccion (TYSON)**
- Generacion de **dashboards HTML** con semaforizacion
- Generacion de **slides de presentacion** (FISA y AEF)
- **Deteccion de transacciones sospechosas** (PLD/AML >$40,000 MXN)
- Un **orquestador maestro** (`DirectorioDirectores`) que ejecuta 19 funciones secuencialmente

---

## 2. ARQUITECTURA DEL SPREADSHEET

### 2.1 Mapa de Hojas (18 total)

```
DATOS DE ENTRADA
+-- Datos de la revision          (metadata de la visita + plantilla empleados)
+-- Herramientas de consulta      (lookups de empleados, sucursales, herramientas)
+-- Muestras                      (muestreo de creditos/documentos a revisar)
+-- Reporte CU                    (datos de Caja Unica via API TYSON)

MODULOS DE EVALUACION (6 modulos con pruebas de control)
+-- 1. Control de Valores         (manejo de efectivo/caja)
|   +-- 1.1 Tcs/Trv - CU         (sub-detalle: transacciones CU, TRV, cierres)
|   +-- 1.2 Movimientos en Caja   (sub-detalle: disposiciones, cancelaciones, reembolsos)
+-- 2. Originacion de Credito     (proceso de otorgamiento + FPD + NeverPaid)
+-- 3. Control de Expedientes     (documentacion de creditos)
+-- 4. Cobranza                   (gestion de cobranza + Caja Movil + gestiones)
+-- 5. Cumplimiento               (regulatorio/compliance CONDUSEF)
+-- 6. Seguridad de la Informacion (seguridad fisica y logica)

CONSOLIDACION Y RESULTADOS
+-- Tablero                       (dashboard de calificaciones ponderadas)
+-- BD2026                        (catalogo maestro de 71 pruebas de control)
+-- Hallazgos2026                 (registro de hallazgos con remediacion)
+-- Pre informe                   (reporte preliminar)
+-- Slide Publicacion             (datos para slides FISA/AEF)

OCULTAS
+-- Formato de arqueo             (plantilla de arqueo manual por denominacion)
```

---

## 3. APPS SCRIPT: ANALISIS COMPLETO (23 archivos)

### 3.1 Arquitectura General del Codigo

```
PUNTO DE ENTRADA
+-- onOpen()                        Menu "Tablero Calificaciones"
+-- DirectorioDirectores()          ORQUESTADOR MAESTRO (19 funciones)

POBLADO DE DATOS (desde spreadsheets externos)
+-- Plantilla()                     Plantilla de empleados (FISA/AEF)
+-- OriginacionCredi()              Datos consolidados de originacion
+-- Traduccion()                    Traduccion de codigos internos
+-- Riesgo()                        Normalizacion de niveles de riesgo
+-- Reemplazar()                    Reemplazo de codigos de producto
+-- Informe()                       Datos historicos (Var1, Var2)
+-- Sobrante()                      Sobrantes/excedentes (Var5)
+-- DisposicionAtipica()            Disposiciones atipicas
+-- NumerosDuplicados()             Numeros duplicados (fraude)
+-- ContratosDormidos()             Contratos dormidos
+-- FPD()                           First Payment Default
+-- NeverPaid()                     Creditos nunca pagados
+-- PendienteDepCob()               Depositos de cobranza pendientes
+-- Bonificaciones()                Bonificaciones/descuentos
+-- PagosCajaMovil()                Pagos de Caja Movil
+-- Mongo()                         Extracto MongoDB (originacion)
+-- Pivote()                        Extracto sistema PIVOTE
+-- Gestiones()                     Gestiones de cobranza

POBLADO DE DATOS (desde API)
+-- ReportedeCaja()                 API TYSON: operaciones de caja (CSV)

DETECCION DE ANOMALIAS
+-- TCSCajaUnica()                  Transacciones >$40,000 (PLD/AML)

VISUALIZACION
+-- obtenerDatosTablero()           Datos para dashboard HTML
+-- obtenerDatosSlide()             Datos para slides FISA/AEF
+-- mostrarTablero()                Modal: dashboard 740x520px
+-- mostrarSlideFisa()              Modal: slide FISA 1000x700px
+-- mostrarSlideAef()               Modal: slide AEF 1000x700px

UTILIDADES
+-- NombrePropios()                 Capitalizacion de nombres
+-- parseFechaFlexibleMX()          Parser robusto de fechas mexicanas
+-- normSucursal() / igualesSucursal()  Normalizacion de IDs sucursal
```

### 3.2 Detalle por Archivo

#### `Codigo.js` - Menu y Visualizacion

| Funcion | Descripcion |
|---------|-------------|
| `onOpen()` | Crea menu "Tablero Calificaciones" con 3 items: Tablero, Slide FISA, Slide AEF |
| `obtenerDatosTablero()` | Lee Tablero (E6-I6, B2, F11, E11), retorna JSON con indicadores y KPI |
| `obtenerDatosSlide()` | Lee Tablero + Datos de la revision + Slide Publicacion + logos de Drive (base64) |
| `mostrarTablero()` | Abre modal 740x520 con `TableroHTML.html` |
| `mostrarSlideFisa()` | Abre modal 1000x700 con `SlideFisaHTML.html` |
| `mostrarSlideAef()` | Abre modal 1000x700 con `SlideAefHTML.html` |

**APIs externas:** Google Drive (DriveApp.getFileById) para logos corporativos FISA/AEF.

#### `Macro principal.js` - Orquestador Maestro

**`DirectorioDirectores()`** es la funcion principal que:
1. Busca directorio de directores en spreadsheet externo
2. Escribe datos del director en `Datos de la revision` (C8, 8 filas)
3. Ejecuta **19 funciones** en secuencia:

```
1.  Plantilla()           -> Datos de la revision (G4:Z)
2.  OriginacionCredi()     -> 2.-Originacion (A22+, 10 cols)
3.  Traduccion()           -> 2.-Originacion (col J, codigos)
4.  ReportedeCaja()        -> Reporte CU (A3+, API TYSON)
5.  Riesgo()               -> 2.-Originacion (col I, niveles)
6.  Reemplazar()           -> 2.-Originacion (col C, productos)
7.  Informe()              -> Datos de la revision (C31-C33)
8.  Sobrante()             -> 1.-Control de Valores (row 36, col AM)
9.  DisposicionAtipica()   -> 1.-Control de Valores (row 73, col A, 18 cols)
10. NumerosDuplicados()    -> 1.-Control de Valores (row 73, cols W-AM dispersas)
11. ContratosDormidos()    -> 1.-Control de Valores (row 36, cols S-AB dispersas)
12. FPD()                  -> 2.-Originacion (row 23, col P, 5 cols)
13. NeverPaid()            -> 2.-Originacion (row 23, col W, 4 cols)
14. PendienteDepCob()      -> 4.-Cobranza (row 60, cols B-H)
15. Bonificaciones()       -> 4.-Cobranza (row 60, col K, 4 cols)
16. PagosCajaMovil()       -> 4.-Cobranza (row 24, col Q, 25 cols)
17. Mongo()                -> 2.-Originacion (row 48, col P, 7 cols)
18. Pivote()               -> 2.-Originacion (row 48, col Y, 8 cols)
19. Gestiones()            -> 4.-Cobranza (row 150, col B, 8 cols)
```

**Funciones auxiliares incluidas:**
- `Plantilla()` - Carga plantilla de empleados (FISA o AEF, col J para match)
- `OriginacionCredi()` - Datos consolidados de originacion (formatea fechas)
- `Traduccion()` - Convierte codigos: `disposicion E` -> "Efectivo", `TYSON|MOBILE` -> etc.
- `Riesgo()` - Normaliza: `B`->"Bajo", `M`->"Medio"
- `Reemplazar()` - Codigos producto: `AUME`->"ILC Aumento", `DISM`->"DLC Decremento"
- `NombrePropios()` - ProperCase para nombres (definida pero NO llamada)

#### `Reporte.js` - API de Produccion TYSON

**`ReportedeCaja()`**
- **API endpoint:** `https://cu-consultas-v1-service.tysonprod.com/v1/reportes/operaciones_caja`
- **Parametros:** `fecha`, `fechaFinal`, `empresa` (FISA=000100000000, AEF=000100000004), `sucursal`
- **Respuesta:** CSV parseado con `Utilities.parseCsv()`
- **Destino:** Hoja "Reporte CU", desde A3
- Lee parametros de "Datos de la revision" (C7, C9, C23, E23)

#### `Reporte Teacher.js` - Deteccion PLD/AML

**`TCSCajaUnica()`**
- Lee hoja "1.1 Tcs/Trv - CU"
- Detecta **2+ transacciones consecutivas >$40,000 MXN** del mismo titular
- Marca con "Movimiento" en columna I
- Implementa control de **Prevencion de Lavado de Dinero** (umbral regulatorio mexicano)
- Registrada como macro en `appsscript.json`

#### `Informe.js` - Datos Historicos

**`Informe()`**
- Lee sucursal de C7, busca en spreadsheet externo `14B1kpFukGQ0g...`
- Hojas "Var1 aux" y "Var2 aux": ultimo dato del ultimo anio
- Escribe en C31 (Var1) y C32 (Var2) de "Datos de la revision"
- Incluye `parseFechaFlexibleMX()`: parser robusto que maneja fechas ISO, europeas, seriales Excel, texto espanol con acentos

#### `Sobrante.js` - Excedentes TRV

**`Sobrante()`**
- Fuente: spreadsheet `14B1kpFukGQ0g...`, hoja "Var5"
- Filtra por sucursal (col F) y rango de fechas (col B)
- Destino: "1.-Control de Valores", row 36, col AM, 7 columnas
- Incluye normalizacion de sucursal (quita ceros a la izquierda)

#### `Disposiciones aticipica.js` - Disposiciones Atipicas

**`DisposicionAtipica()`**
- Fuente: spreadsheet `1RJ1pbDM5FEps...`, hoja "Extracto 1"
- Filtra por sucursal (col D) y fecha (col B)
- Extrae 18 columnas especificas con reordenamiento
- Destino: "1.-Control de Valores", row 73, col A

#### `Numeros Duplicados.js` - Deteccion de Fraude

**`NumerosDuplicados()`**
- Fuente: spreadsheet `1RlWUPV6h8PQb...`, hoja "Extracto 2"
- Detecta numeros telefonicos duplicados entre contratos (indicador de fraude)
- Filtra por sucursal (col B, numerico) y fecha (col C)
- Destino: "1.-Control de Valores", row 73, columnas dispersas (W, X, Y, Z, AB, AC, AE, AH, AJ, AK, AM)

#### `Contratos Domidos.js` - Contratos Dormidos

**`ContratosDormidos()`**
- Fuente: spreadsheet `1x-ZF7tPBNnlI...`, hoja "Extracto 1"
- Creditos aprobados sin actividad (indicador de fraude/fallo en originacion)
- Filtra por sucursal (col B, string) y fecha (col F)
- Extrae 9 columnas de fuente amplia (hasta col AT)
- Destino: "1.-Control de Valores", row 36, columnas dispersas (S-AB)

#### `First Payment.js` - Primer Incumplimiento

**`FPD()`** (First Payment Default)
- Fuente: spreadsheet `1GXiHToN7PeZI...`, hoja "Extracto FPD"
- Creditos que incumplieron en su primer pago (riesgo crediticio/fraude)
- Filtra por sucursal (col X) y fecha (col AQ)
- Destino: "2.-Originacion de Credito", row 23, col P, 5 columnas

#### `Never Paid.js` - Nunca Pagados

**`NeverPaid()`**
- Fuente: mismo spreadsheet que FPD, hoja "Extracto NP"
- Creditos que NUNCA han tenido pago (fraude severo)
- Filtra SOLO por sucursal (col X), **sin filtro de fecha** (acumulado historico)
- Destino: "2.-Originacion de Credito", row 23, col W, 4 columnas

#### `Pendiente dep Cob.js` - Depositos Pendientes Cobranza

**`PendienteDepCob()`**
- Fuente: spreadsheet `1-xJjMkdd1-kS...`, hoja "Pendientes dep 2025"
- Depositos de cobranza pendientes de aplicar
- Filtra por sucursal (col F) y fecha (col A)
- Destino: "4.-Cobranza", row 60, cols B-H (no contiguas)

#### `Bonificaciones.js` - Descuentos/Bonificaciones

**`Bonificaciones()`**
- Fuente: spreadsheet `1xRcxePceXzgU...`, hoja "Extracto 2"
- Bonificaciones aplicadas a creditos
- Filtra por sucursal (col A) y **mes completo** derivado de C20
- Destino: "4.-Cobranza", row 60, col K, 4 columnas

#### `Pagos Caja Movil.js` - Pagos Moviles

**`PagosCajaMovil()`**
- Fuente: spreadsheet `1mRe2YXquuuVA...`, hoja "datos"
- Pagos recibidos via app Caja Movil (campo, GPS, comprobantes)
- Filtra por sucursal (col R) y fecha (col I)
- **25 columnas** de datos detallados
- Destino: "4.-Cobranza", row 24, col Q

#### `Mongo.js` - Extracto MongoDB

**`Mongo()`**
- Fuente: spreadsheet `1x3Rkl42gtqvI...`, hoja "Ext Mongo"
- Datos de originacion pre-extraidos de MongoDB (plataforma TYSON)
- Filtra por sucursal (col B), fecha (col E), y col D no vacia
- Destino: "2.-Originacion de Credito", row 48, col P, 7 columnas

#### `Pivote.js` - Sistema PIVOTE

**`Pivote()`**
- Fuente: spreadsheet `1cY_f9meeFdPR...`, hoja "Extracto_PIVOTE"
- Datos del sistema PIVOTE con concatenacion de nombre completo (cols G+H+I+J)
- Filtra por sucursal (col M) y fecha (col D)
- Destino: "2.-Originacion de Credito", row 48, col Y, 8 columnas

#### `Gestiones.js` - Gestiones de Cobranza

**`Gestiones()`**
- Fuente: spreadsheet `1kHVavFbygtSI...`, hoja "Extracto 1"
- Registros de gestion de cobranza (sistema GESTIONA)
- Filtra SOLO por sucursal (col B), **sin filtro de fecha**
- 8 columnas con reordenamiento
- Destino: "4.-Cobranza", row 150, col B

#### `Prue.js` - Plantilla Alternativa

**`Plantilla1()`**
- Version alternativa de `Plantilla()` con misma logica
- Selecciona "Plantilla Fisa" o "Plantilla Aef" segun C8

#### `Generar_tablero.js` - Duplicado

- Contiene `obtenerDatosSlide()` **duplicada** de `Codigo.js`
- Problema potencial: en GAS, la ultima definicion cargada gana

### 3.3 Templates HTML (3 archivos)

#### `TableroHTML.html` - Dashboard Card (700x400px)

```
+---------------------------+-----------------------------------+
|     SIDEBAR (35%)         |        MAIN CONTENT (65%)         |
|  #0c203d (navy blue)      |                                   |
|                           |     "Pruebas Realizadas"          |
|  "Resultado Riesgo        |                                   |
|   Operativo"              |  [1] Control de Valores    [85]   |
|  "Revision Integral"      |  [2] Originacion           [72]   |
|                           |  [3] Expedientes           [90]   |
|     +--------+            |  [4] Cobranza              [65]   |
|     |  85    |            |  [5] Cumplimiento          [80]   |
|     | (KPI)  |            |                                   |
|     +--------+            |  Leyenda:                         |
|   [Riesgo Moderado]       |  ■ Critico ■ Alto ■ Mod ■ Bajo   |
|                           |                                   |
|  Anterior: Critico        |                                   |
|  Fecha: 12 ago 2024       |        [Descargar PNG]            |
+---------------------------+-----------------------------------+
```

**Semaforo de colores:**
- Critico (0-69): `#da2626` (rojo)
- Alto (70-79): `#ff9900` (naranja)
- Moderado (80-89): `#fad72b` (amarillo)
- Bajo (90-100): `#326e14` (verde)

**Tecnologias:** Font Quicksand, html2canvas v1.4.1, google.script.run

#### `SlideFisaHTML.html` - Slide FISA (960x600px)

```
+================================================================+
| HEADER (rojo #cc0000)                                          |
| "Financiera Independencia"    Sucursal | Zona | Clave | [Logo] |
| "Control Interno y RO"                                         |
+================================================================+
|  COL IZQUIERDA (40%)    ||   COL DERECHA (60%)                 |
|                         ||                                     |
|  Responsables:          ||   Hallazgos Relevantes              |
|  - Subdirector          ||   (texto preformateado)             |
|  - Zonal                ||                                     |
|  - Gerente de Negocio   ||   Conclusion                       |
|  ____________________   ||   (texto preformateado)             |
|                         ||                                     |
|  Resultado:             ||                                     |
|  [1] Ctrl Valores [85]  ||                                     |
|  [2] Originacion  [72]  ||                                     |
|  [3] Expedientes  [90]  ||                                     |
|  [4] Cobranza     [65]  ||                                     |
|  [5] Cumplimiento [80]  ||                                     |
|  ____________________   ||                                     |
|  Nivel: [Moderado]      ||                                     |
|  Cumplimiento: [82%]    ||                                     |
+================================================================+
```

#### `SlideAefHTML.html` - Slide AEF (960x600px)

Identico a FISA pero con branding AEF:
- Header: purpura (`#7b5aa6`) en vez de rojo
- Titulos de seccion: naranja (`#e67e22`)
- Titulo: "Apoyo Economico Familiar"
- Border-radius: 0px (esquinas rectas vs 8px de FISA)

### 3.4 Fuentes de Datos Externas (Mapa Completo)

```
SPREADSHEETS EXTERNOS (9)
+-- 10spXrKMor5n...  Directorio de Directores
+-- 1DarPJy8txOQ...  Plantillas FISA/AEF (empleados)
+-- 1hwE4dLvfjC9...  Consolidado Originacion FINDEP
+-- 14B1kpFukGQ0...  Variables Historicas (Var1, Var2, Var5/Sobrante)
+-- 1RJ1pbDM5FEp...  Disposiciones Atipicas
+-- 1RlWUPV6h8PQ...  Numeros Duplicados
+-- 1x-ZF7tPBNnl...  Contratos Dormidos
+-- 1GXiHToN7PeZ...  FPD + NeverPaid
+-- 1-xJjMkdd1-k...  Depositos Pendientes Cobranza
+-- 1xRcxePceXzg...  Bonificaciones
+-- 1mRe2YXquuuV...  Pagos Caja Movil
+-- 1x3Rkl42gtqv...  Extracto MongoDB
+-- 1cY_f9meeFdP...  Extracto PIVOTE
+-- 1kHVavFbygtS...  Gestiones Cobranza

API DE PRODUCCION (1)
+-- cu-consultas-v1-service.tysonprod.com
    /v1/reportes/operaciones_caja (CSV)

GOOGLE DRIVE (2 archivos)
+-- 1i2MGTqTD0Wk...  Logo FISA (imagen)
+-- 1-9QzUH8CHiG...  Logo AEF (imagen)
```

### 3.5 Problemas Detectados en el Codigo

| # | Problema | Archivo | Impacto |
|---|----------|---------|---------|
| 1 | `obtenerDatosSlide()` duplicada | Codigo.js + Generar_tablero.js | Comportamiento impredecible |
| 2 | `_coincideSucursal()` redefinida con logica diferente | First Payment.js + Never Paid.js | Match inconsistente de sucursales |
| 3 | Sin manejo de errores en API TYSON | Reporte.js | Falla silenciosa si API no responde |
| 4 | 19 funciones ejecutadas secuencialmente | Macro principal.js | Timeout potencial (~6 min limite GAS) |
| 5 | Escritura en columnas no contiguas (hardcoded) | Varios archivos | Fragil ante cambios en estructura |
| 6 | Sin cache de datos entre funciones | Todos | Lee "Datos de la revision" 19+ veces |
| 7 | `NombrePropios()` definida pero nunca llamada | Macro principal.js | Codigo muerto |

---

## 4. DETALLE POR HOJA

### 4.1 Datos de la Revision (Hoja Maestra)
**Proposito:** Captura de metadatos y punto de entrada de cada revision.

| Campo | Tipo | Celda | Fuente |
|-------|------|-------|--------|
| Gerente de Riesgo Operativo | Fijo | C4 | "Alberto Pineda Naffate" |
| Coordinador RO | Dropdown | C5 | 4 coordinadores |
| Asesor RO (ARO) | Dropdown | C6 | 10+ asesores |
| # Sucursal | Input | C7 | Trigger de VLOOKUPs y DirectorioDirectores() |
| Sucursal | Auto | C8/F8 | VLOOKUP desde Herramientas |
| Negocio | Auto | C9 | FISA o AEF |
| Zona/Subdireccion/Direccion | Auto | C10-C12 | Jerarquia organizacional |
| Gerente de Negocio | Auto | C18 | `IFERROR(VLOOKUP("Gerente de Ne*",K:M,3,0)="Activo"...)` |
| Fecha de Inicio | Fecha | C20 | Input manual |
| Periodo de Revision | Fechas | C23-E23 | Rango inicio-fin |
| Modalidad | Dropdown | C25 | Presencial / Remota |
| Nivel Riesgo Calculadora | Dropdown | C26 | Critico/Alto/Moderado/Bajo |
| Plantilla empleados | Tabla | G4:Z | Poblada por Plantilla() |
| Hallazgos relevantes | Input | C31-C34 | Var1, Var2 via Informe() |

### 4.2 Modulo 1: Control de Valores (28 controles)

**Formula de resultado (AJ2):**
```
=SUMIFS(E5:E32,A5:A32,"<>*Prestamo de usuario*")
 + IF(COUNTIFS(A5:A32,"*Prestamo de usuario*",E5:E32,20)>0, 20, 0)
 - IF(COUNTIFS(A5:A32,"*Prestamo de usuario*",D5:D32,"No")>=2, 20, 0)
```

**Datos poblados por Apps Script:**
- Row 36, col AM: Sobrantes (Sobrante.js)
- Row 36, cols S-AB: Contratos Dormidos (Contratos Domidos.js)
- Row 73, col A: Disposiciones Atipicas (18 cols)
- Row 73, cols W-AM: Numeros Duplicados (11 cols dispersas)

**Sub-hojas:**
- **1.1 Tcs/Trv - CU:** TRV, cierres de caja, traspasos a caja de seguridad. `TCSCajaUnica()` detecta transacciones >$40,000
- **1.2 Movimientos en Caja:** Disposiciones, cancelaciones, reembolsos con checklist por ticket

### 4.3 Modulo 2: Originacion de Credito (14 controles)

**14 controles con peso total de 100 pts:**

| # | Control | Peso | Formula |
|---|---------|------|---------|
| 1 | Validacion identidad (Validenti/Veridenti) | 10 | `=IF(K5="SI",10,0)` |
| 2 | Validacion direccion | 9 | `=IF(K6="SI",9,0)` |
| 3 | Veritele | 10 | `=IF(K7="SI",10,0)` |
| 4 | Veri-email | 10 | `=IF(K8="SI",10,0)` |
| 5 | Captura en sistema | 5 | `=IF(K9="SI",5,0)` |
| 6 | Comprobantes de ingresos | 5 | `=IF(K10="SI",5,0)` |
| 7 | Validacion PALENCA IMSS | 0 | `=IF(K11="SI",0,0)` (informativo) |
| 8 | Analisis Buro de Credito | 10 | `=IF(K12="SI",10,0)` |
| 9 | Captura ingresos/egresos (CAP) | 5 | `=IF(K13="SI",5,0)` |
| 10 | Verificacion Domicilio | 10 | `=IF(K14="SI",10,0)` |
| 11 | Verificacion Empleo/Negocio | 8 | `=IF(K15="SI",8,0)` |
| 12 | Verifirma (Firma) | 5 | `=IF(K16="SI",5,0)` |
| 13 | Verifirma (Fotografia) | 5 | `=IF(K17="SI",5,0)` |
| 14 | Verifirma (NIP/OTP) | 8 | `=IF(K18="SI",8,0)` |

**Resultado:** `=SUM(L5:L18)` -> celda AS2

**Datos poblados por Apps Script:**
- Row 22: Datos consolidados de originacion (OriginacionCredi.js)
- Row 23, col P: First Payment Default (5 cols)
- Row 23, col W: Never Paid (4 cols)
- Row 48, col P: Extracto MongoDB (7 cols)
- Row 48, col Y: Extracto PIVOTE (8 cols)

### 4.4 Modulo 3: Control de Expedientes (2 controles)

| # | Control | Formula |
|---|---------|---------|
| 1 | Integracion de expediente | `=60-(faltantes*3)` |
| 2 | Incidencias (Documentos) | `=40-(incidencias*2)` |

**Resultado:** `=SUM(H7:H8)` -> celda AM3. Penalizacion proporcional por documento faltante.

### 4.5 Modulo 4: Cobranza (12 controles)

**12 controles de 5 pts c/u:** `=IF(D7="SI",5,0)` ... `=IF(D18="SI",5,0)`

**Resultado:** `=SUM(E7:E18)` -> celda AJ2

**Datos poblados por Apps Script:**
- Row 24, col Q: Pagos Caja Movil (25 cols)
- Row 60, cols B-H: Depositos pendientes cobranza
- Row 60, col K: Bonificaciones (4 cols)
- Row 150, col B: Gestiones de cobranza (8 cols)

### 4.6 Modulo 5: Cumplimiento (5-6 controles)

**Controles de cumplimiento regulatorio:**
- Aviso de Privacidad (LFPDPPP)
- Poster UNE (Unidad Especializada)
- Buro de Entidades
- Poster de Comisiones y CAT
- Despachos de Cobranza

**20 pts por control:** `=IF(D6="SI",20,0)`
**Resultado:** `=SUM($E$6:$E$11)` -> celda AI3

### 4.7 Modulo 6: Seguridad de la Informacion (10 controles)

10 controles de seguridad fisica y logica (bloqueo equipos, antivirus PANDA, USB, SITE, passwords, 2FA WhatsApp).

**NOTA:** Este modulo se evalua pero **NO se incluye en la calificacion ponderada final**.

### 4.8 Tablero (Dashboard de Resultados)

**Formula central:**
```
Calificacion = ROUNDDOWN(
    CtrlValores * 0.30 +
    Originacion * 0.20 +
    Expedientes * 0.10 +
    Cobranza    * 0.25 +
    Cumplimiento * 0.15
)
```

**Clasificacion de riesgo:**
| Rango | Nivel | Color |
|-------|-------|-------|
| 90-100 | Riesgo Bajo | Verde #326e14 |
| 80-89 | Riesgo Moderado | Amarillo #fad72b |
| 70-79 | Riesgo Alto | Naranja #ff9900 |
| 0-69 | Riesgo Critico | Rojo #da2626 |

### 4.9 BD2026 (Catalogo Maestro)

**71 pruebas de control** organizadas en 6 categorias con nomenclatura:
- Ctrl_val1-20 (Control de Valores)
- Orig_cred1-20 (Originacion)
- Ctrl_exp1-20 (Expedientes)
- Cobr_1-20 (Cobranza)
- Cump_1-20 (Cumplimiento)
- Seg_Inf1-20 (Seguridad)

Columnas: #, Prueba, Titulo del Control, Reactivo, Actividad del Control, Criterios para la revision, Evidencia del Control, Frecuencia, Muestra.

### 4.10 Hallazgos2026

Registro de hallazgos con **55 columnas** incluyendo:
- Identidad de sucursal y jerarquia organizacional
- Detalle del hallazgo y observacion
- Remediacion: plan, fecha compromiso, evidencia, % avance, estatus
- Clasificacion de riesgo: N1/N2/N3, clave del riesgo

### 4.11 Muestras

Define documentos fisicos a solicitar y tamanos de muestra:
- Documentos fisicos (5 items)
- Tickets Caja: 10 disposiciones, 10 reembolsos, 5 cancelaciones, 3 cheques
- Cobranza: 10 Caja Movil, recibos provisionales, 10 extensiones, 10 bonificaciones
- Cumplimiento y seguridad: 7 items

---

## 5. PROBLEMAS DEL MODELO ACTUAL

### Problemas de la Herramienta en Google Sheets

| # | Problema | Severidad |
|---|----------|-----------|
| 1 | **No escalable:** Una hoja por revision, se duplica manualmente | Alta |
| 2 | **Sin historial centralizado:** Cada revision es un archivo separado | Alta |
| 3 | **Sin control de acceso granular:** Todos los AROs ven todos los datos | Alta |
| 4 | **Formulas fragiles:** Pueden romperse al copiar/mover celdas | Media |
| 5 | **Sin auditoria de cambios:** No hay log de quien modifico que | Alta |
| 6 | **Rendimiento:** Originacion tiene 85,000+ filas potenciales | Media |
| 7 | **Sin integracion directa con BigQuery** | Alta |
| 8 | **Catalogo de controles hardcoded** en multiples hojas | Media |
| 9 | **Sin workflow de aprobacion** del informe | Media |
| 10 | **Reporteria limitada:** No hay analisis cruzados entre revisiones | Alta |

### Problemas del Codigo Apps Script

| # | Problema | Severidad |
|---|----------|-----------|
| 1 | **19 funciones secuenciales** -> riesgo de timeout (6 min limit GAS) | Alta |
| 2 | **9 spreadsheets externos** como ETL intermedio (fragil, sin versionado) | Alta |
| 3 | **Funciones duplicadas** (`obtenerDatosSlide`, `_coincideSucursal`) | Media |
| 4 | **Sin manejo de errores** en llamada a API TYSON | Media |
| 5 | **Columnas hardcodeadas** (indices magicos sin documentar) | Media |
| 6 | **Lee "Datos de la revision"** 19+ veces (sin cache) | Baja |
| 7 | **Codigo muerto** (`NombrePropios` definida pero no usada) | Baja |
| 8 | **Sin tests unitarios** | Media |

---

## 6. PROPUESTA: SISTEMA DE GESTION DE RIESGO OPERATIVO (SGRO)

### 6.1 Arquitectura Propuesta

```
                    +------------------+
                    |   USUARIOS       |
                    |   AROs, Coord,   |
                    |   Gerente RO     |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   FRONTEND       |
                    |   React + TS     |
                    |   + Tailwind     |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   BACKEND API    |
                    |   FastAPI (Py)   |
                    |   + Auth Google  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +-------v------+ +----v--------+
     | PostgreSQL  |  |   BigQuery   | | APIs Externas|
     | (Cloud SQL) |  |  (Analytics) | | - TYSON CU   |
     | Transaccional|  | Reporteria  | | - GESTIONA   |
     +-------------+  +--------------+ | - MongoDB    |
                                        | - PIVOTE     |
                                        +--------------+
```

### 6.2 Stack Tecnologico

| Capa | Tecnologia | Justificacion |
|------|------------|---------------|
| Frontend | React + TypeScript + Tailwind | Expertise existente en FINDEP |
| Backend | FastAPI (Python) | Rapido desarrollo, BigQuery SDK nativo |
| BD Transaccional | PostgreSQL (Cloud SQL) | ACID, datos relacionales |
| BD Analitica | BigQuery | Estandar FINDEP para reporting |
| Auth | Google Identity | SSO con @findep.com.mx |
| Hosting | Cloud Run o GKE | Infraestructura FINDEP |
| CI/CD | Azure DevOps | Pipeline existente |
| PDF | WeasyPrint o Puppeteer | Generacion de informes |

### 6.3 Modelo de Datos (PostgreSQL)

```sql
-- ============================================
-- CATALOGOS
-- ============================================

CREATE TABLE catalogos.controles (
    id SERIAL PRIMARY KEY,
    modulo VARCHAR(50) NOT NULL,           -- 'control_valores', 'originacion', etc.
    numero INT NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    reactivo TEXT NOT NULL,                 -- La pregunta de evaluacion
    actividad_control TEXT,
    criterios_revision TEXT,
    evidencia_control TEXT,
    frecuencia VARCHAR(50),
    peso_puntos DECIMAL(5,2) NOT NULL,     -- Puntos si cumple
    tipo_evaluacion VARCHAR(20) DEFAULT 'binario', -- 'binario' o 'penalizacion'
    nomenclatura VARCHAR(20),              -- Ctrl_val1, Orig_cred1, etc.
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE catalogos.ponderaciones (
    id SERIAL PRIMARY KEY,
    modulo VARCHAR(50) NOT NULL,
    peso DECIMAL(3,2) NOT NULL,            -- 0.30, 0.20, etc.
    incluido_en_calificacion BOOLEAN DEFAULT TRUE,
    vigencia_inicio DATE NOT NULL,
    vigencia_fin DATE
);

CREATE TABLE catalogos.usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(200) UNIQUE NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    rol VARCHAR(50) NOT NULL,              -- 'aro','coordinador','gerente_ro','admin'
    activo BOOLEAN DEFAULT TRUE
);

-- ============================================
-- REVISIONES
-- ============================================

CREATE TABLE revisiones.revision (
    id SERIAL PRIMARY KEY,
    clave_revision VARCHAR(50) UNIQUE NOT NULL,
    id_sucursal INT NOT NULL,
    nombre_sucursal VARCHAR(200),
    negocio VARCHAR(10) NOT NULL,          -- 'FISA' o 'AEF'
    zona VARCHAR(100),
    subdireccion VARCHAR(100),
    direccion VARCHAR(100),
    gerente_negocio VARCHAR(200),
    subdirector_negocio VARCHAR(200),
    gerente_zonal VARCHAR(200),
    aro_id INT REFERENCES catalogos.usuarios(id),
    coordinador_id INT REFERENCES catalogos.usuarios(id),
    modalidad VARCHAR(20) NOT NULL,        -- 'Presencial' o 'Remota'
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    fecha_presentacion DATE,
    informe_pdf_url TEXT,
    carpeta_evidencias_url TEXT,
    calificacion_final DECIMAL(5,2),
    nivel_riesgo VARCHAR(20),
    hallazgos_relevantes TEXT,
    conclusion TEXT,
    status VARCHAR(20) DEFAULT 'en_progreso',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE revisiones.evaluacion_control (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    control_id INT REFERENCES catalogos.controles(id),
    cumple BOOLEAN,
    calificacion DECIMAL(5,2),
    observacion TEXT,
    evidencia_url TEXT,
    credito_evaluado VARCHAR(50),
    es_hallazgo BOOLEAN DEFAULT FALSE,
    fecha_evaluacion TIMESTAMP DEFAULT NOW(),
    evaluado_por INT REFERENCES catalogos.usuarios(id)
);

CREATE TABLE revisiones.calificacion_modulo (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    modulo VARCHAR(50) NOT NULL,
    calificacion_bruta DECIMAL(5,2),
    peso_ponderacion DECIMAL(3,2),
    calificacion_ponderada DECIMAL(5,2),
    nivel_riesgo VARCHAR(20),
    UNIQUE(revision_id, modulo)
);

CREATE TABLE revisiones.hallazgo (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    control_id INT REFERENCES catalogos.controles(id),
    titulo VARCHAR(300) NOT NULL,
    descripcion TEXT,
    plan_accion TEXT,
    evidencia_url TEXT,
    fecha_hallazgo DATE NOT NULL,
    fecha_compromiso DATE,
    fecha_remediacion_real DATE,
    status VARCHAR(20) DEFAULT 'abierto',
    pct_avance DECIMAL(5,2) DEFAULT 0,
    responsable VARCHAR(200),
    monto_afectacion DECIMAL(15,2)
);

CREATE TABLE revisiones.muestra (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    tipo VARCHAR(50),                      -- 'credito','ticket','recibo','extension'
    numero_referencia VARCHAR(50),
    modulo VARCHAR(50),
    datos_adicionales JSONB
);

-- ============================================
-- DATOS OPERATIVOS (reemplaza spreadsheets ETL)
-- ============================================

CREATE TABLE datos.reporte_caja_unica (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    datos JSONB NOT NULL,                  -- Datos crudos de API TYSON
    fecha_extraccion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE datos.indicadores_riesgo (
    id SERIAL PRIMARY KEY,
    revision_id INT REFERENCES revisiones.revision(id),
    tipo VARCHAR(50) NOT NULL,             -- 'fpd','never_paid','disp_atipica',
                                           -- 'num_duplicados','contrato_dormido',
                                           -- 'sobrante','bonificacion','caja_movil'
    datos JSONB NOT NULL,
    fecha_extraccion TIMESTAMP DEFAULT NOW()
);
```

### 6.4 Modelo BigQuery (Star Schema)

```sql
-- Tabla de hechos: Calificaciones por revision
CREATE TABLE riesgo_operativo.fact_calificaciones (
    revision_id INT64,
    clave_revision STRING,
    id_sucursal INT64,
    nombre_sucursal STRING,
    negocio STRING,
    fecha_revision DATE,
    modulo STRING,
    calificacion_bruta FLOAT64,
    peso_ponderacion FLOAT64,
    calificacion_ponderada FLOAT64,
    nivel_riesgo_modulo STRING,
    calificacion_final_sucursal FLOAT64,
    nivel_riesgo_sucursal STRING,
    aro STRING,
    coordinador STRING,
    modalidad STRING,
    zona STRING,
    subdireccion STRING,
    direccion STRING,
    _synced_at TIMESTAMP
);

-- Tabla de hechos: Hallazgos
CREATE TABLE riesgo_operativo.fact_hallazgos (
    hallazgo_id INT64,
    revision_id INT64,
    id_sucursal INT64,
    nombre_sucursal STRING,
    negocio STRING,
    fecha_revision DATE,
    modulo STRING,
    control STRING,
    titulo_hallazgo STRING,
    plan_accion STRING,
    status STRING,
    fecha_hallazgo DATE,
    fecha_compromiso DATE,
    fecha_remediacion DATE,
    dias_abierto INT64,
    pct_avance FLOAT64,
    monto_afectacion FLOAT64,
    aro STRING,
    zona STRING,
    _synced_at TIMESTAMP
);

-- Tabla de hechos: Evaluaciones detalladas
CREATE TABLE riesgo_operativo.fact_evaluaciones (
    evaluacion_id INT64,
    revision_id INT64,
    id_sucursal INT64,
    modulo STRING,
    control_nombre STRING,
    cumple BOOL,
    calificacion FLOAT64,
    credito_evaluado STRING,
    fecha_evaluacion TIMESTAMP,
    _synced_at TIMESTAMP
);

-- Tabla de hechos: Indicadores de riesgo operativo
CREATE TABLE riesgo_operativo.fact_indicadores_riesgo (
    id INT64,
    revision_id INT64,
    id_sucursal INT64,
    tipo STRING,                -- 'fpd','never_paid','disp_atipica', etc.
    cantidad INT64,
    monto_total FLOAT64,
    fecha_revision DATE,
    _synced_at TIMESTAMP
);

-- Dimension: Sucursales
CREATE TABLE riesgo_operativo.dim_sucursales (
    id_sucursal INT64,
    nombre STRING,
    negocio STRING,
    zona STRING,
    subdireccion STRING,
    direccion STRING,
    gerente_negocio STRING,
    _synced_at TIMESTAMP
);

-- Dimension: Controles
CREATE TABLE riesgo_operativo.dim_controles (
    control_id INT64,
    modulo STRING,
    numero INT64,
    nombre STRING,
    reactivo STRING,
    peso_puntos FLOAT64,
    nomenclatura STRING,
    activo BOOL,
    _synced_at TIMESTAMP
);
```

### 6.5 Motor de Calificacion

```python
# engine/calificacion.py

from enum import Enum
from typing import List

class NivelRiesgo(Enum):
    BAJO = "Riesgo Bajo"
    MODERADO = "Riesgo Moderado"
    ALTO = "Riesgo Alto"
    CRITICO = "Riesgo Critico"

PONDERACIONES = {
    "control_valores": 0.30,
    "originacion": 0.20,
    "expedientes": 0.10,
    "cobranza": 0.25,
    "cumplimiento": 0.15,
    # seguridad_info: evaluado pero NO ponderado
}

UMBRALES = [(90, NivelRiesgo.BAJO), (80, NivelRiesgo.MODERADO),
            (70, NivelRiesgo.ALTO), (0, NivelRiesgo.CRITICO)]

def clasificar_riesgo(calificacion: float) -> NivelRiesgo:
    for umbral, nivel in UMBRALES:
        if calificacion >= umbral:
            return nivel
    return NivelRiesgo.CRITICO

def calcular_control_valores(evaluaciones: list) -> float:
    total = 0
    prestamo_cumple = 0
    prestamo_no_cumple = 0
    for ev in evaluaciones:
        if "prestamo de usuario" in ev["control"].lower():
            if ev["cumple"]: prestamo_cumple += 1
            else: prestamo_no_cumple += 1
        else:
            if ev["cumple"]: total += ev["peso"]
    if prestamo_cumple > 0: total += 20
    if prestamo_no_cumple >= 2: total -= 20
    return max(0, total)

def calcular_expedientes(faltantes_tipo1: int, faltantes_tipo2: int) -> float:
    return max(0, 60 - faltantes_tipo1 * 3) + max(0, 40 - faltantes_tipo2 * 2)

def calcular_modulo_estandar(evaluaciones: list) -> float:
    return sum(ev["peso"] if ev["cumple"] else 0 for ev in evaluaciones)

def calcular_calificacion_final(califs: dict) -> tuple:
    total = sum(califs.get(m, 0) * p for m, p in PONDERACIONES.items())
    total = int(total)  # ROUNDDOWN
    return total, clasificar_riesgo(total)
```

### 6.6 Integraciones (Reemplazando Apps Script)

| Funcion GAS Actual | Reemplazo en SGRO |
|--------------------|-------------------|
| `ReportedeCaja()` -> API TYSON | Backend llama directamente a API TYSON |
| `Plantilla()` -> Sheet externo | BD interna de empleados o API de RRHH |
| `OriginacionCredi()` -> Sheet externo | BigQuery query directa |
| `FPD()` / `NeverPaid()` -> Sheet externo | BigQuery query directa |
| `DisposicionAtipica()` -> Sheet externo | BigQuery query directa |
| `NumerosDuplicados()` -> Sheet externo | BigQuery query directa |
| `ContratosDormidos()` -> Sheet externo | BigQuery query directa |
| `Mongo()` -> Sheet (ETL de Mongo) | API directa o BigQuery |
| `Pivote()` -> Sheet (ETL de PIVOTE) | API directa o BigQuery |
| `Gestiones()` -> Sheet (ETL de GESTIONA) | API directa o BigQuery |
| `PagosCajaMovil()` -> Sheet externo | BigQuery query directa |
| `Bonificaciones()` -> Sheet externo | BigQuery query directa |
| `PendienteDepCob()` -> Sheet externo | BigQuery query directa |
| `Sobrante()` -> Sheet externo | BigQuery query directa |
| `TCSCajaUnica()` -> macro | Regla automatica en backend |
| `obtenerDatosTablero/Slide()` | API REST del backend |

**Beneficio clave:** Los 9 spreadsheets ETL intermedios se eliminan. Los datos fluyen directamente de las fuentes (TYSON API, BigQuery, GESTIONA) al sistema.

### 6.7 Pantallas del Sistema Web

| Pantalla | Funcionalidad | Rol |
|----------|--------------|-----|
| Login | SSO Google Identity | Todos |
| Dashboard General | Mapa de calor, KPIs, tendencias por region | Gerente RO |
| Nueva Revision (Wizard) | Paso 1: Sucursal -> Paso 2: Muestras -> Paso 3-8: Modulos -> Paso 9: Resultados | ARO |
| Modulos de Control | Formularios SI/NO con observaciones y evidencia | ARO |
| Tablero de Resultados | Calificacion ponderada con semaforo (replicando dashboard actual) | ARO, Coord |
| Gestion de Hallazgos | CRUD + seguimiento remediaciones + % avance | ARO, Sucursal |
| Catalogo de Controles | CRUD de controles y ponderaciones | Gerente RO |
| Generador de Informes | PDF con branding FISA/AEF (reemplazando slides HTML) | ARO |
| Historial de Revisiones | Busqueda con filtros por sucursal, fecha, nivel riesgo | Todos |
| Indicadores de Riesgo | FPD, NeverPaid, Disp. Atipicas, Num. Duplicados por sucursal | ARO, Coord |

### 6.8 Sincronizacion con BigQuery

```python
# sync/bigquery_sync.py
from google.cloud import bigquery

def sync_revision_completa(revision_id: int):
    """Al publicar una revision, sincroniza todo a BigQuery."""
    client = bigquery.Client()
    dataset = "riesgo_operativo"

    # 1. Calificaciones por modulo
    sync_table(client, dataset, "fact_calificaciones",
               get_calificaciones(revision_id))

    # 2. Hallazgos
    sync_table(client, dataset, "fact_hallazgos",
               get_hallazgos(revision_id))

    # 3. Evaluaciones detalladas
    sync_table(client, dataset, "fact_evaluaciones",
               get_evaluaciones(revision_id))

    # 4. Indicadores de riesgo
    sync_table(client, dataset, "fact_indicadores_riesgo",
               get_indicadores(revision_id))
```

---

## 7. PLAN DE IMPLEMENTACION POR FASES

### Fase 1: MVP (6-8 semanas)
- Login con Google Identity
- Catalogo de controles configurable (migrando las 71 pruebas)
- Formulario de revision (wizard con 6 modulos)
- Motor de calificacion automatico
- Tablero de resultados con semaforo
- Integracion API TYSON (Reporte CU)
- Sincronizacion basica a BigQuery

### Fase 2: Datos Operativos (4 semanas)
- Integracion directa con BigQuery para: FPD, NeverPaid, Disposiciones Atipicas, Numeros Duplicados, Contratos Dormidos
- Deteccion automatica PLD/AML (reemplazando TCSCajaUnica)
- Indicadores de riesgo pre-calculados por sucursal
- Eliminacion de spreadsheets ETL intermedios

### Fase 3: Gestion Completa (4 semanas)
- Gestion de hallazgos con seguimiento y % avance
- Generacion de informe PDF (con branding FISA/AEF)
- Dashboard gerencial con KPIs agregados
- Historial de revisiones con filtros avanzados
- Notificaciones por email

### Fase 4: Analitica Avanzada (3 semanas)
- Dashboard en Looker Studio conectado a BigQuery
- Analisis de tendencias por sucursal/region/zona
- Mapa de calor de riesgo a nivel nacional
- Alertas automaticas por umbrales
- Reportes comparativos entre periodos
- Benchmarking entre sucursales

### Fase 5: Migracion (2 semanas)
- Script de migracion de revisiones historicas (spreadsheets existentes)
- Validacion de calificaciones migradas vs originales
- Capacitacion de usuarios
- Go-live y periodo de transicion (operacion dual)

---

## 8. BENEFICIOS ESPERADOS

| Beneficio | Impacto |
|-----------|---------|
| Eliminacion de 9 spreadsheets ETL intermedios | -100% dependencia de archivos manuales |
| Centralizacion de datos | 1 sola fuente de verdad en PostgreSQL + BigQuery |
| Eliminacion de errores por formulas | -90% errores de calculo |
| Trazabilidad completa | Log de auditoria de quien hizo que y cuando |
| Reporteria en BigQuery | Analisis cruzados en segundos (vs. imposible hoy) |
| Control de acceso por rol | Seguridad de datos por usuario |
| Tiempo de revision | -40% por integracion directa con fuentes |
| Consistencia | Catalogo centralizado, sin duplicidad de funciones |
| Deteccion de fraude automatizada | FPD, NeverPaid, duplicados en tiempo real |
| Escalabilidad | Sin limite de revisiones simultaneas |
