-- Query base de disposiciones con scoring de riesgos integrado
-- Parámetros: {dias_atras} (default: 15)

WITH HGB AS (
  SELECT
    *,
    CASE
      WHEN sucursal_caja != sucursal THEN 'Validar'
    END AS evento_validar,
    CASE
      WHEN sucursal_caja = 43 AND id_caja = '79' THEN 671
      ELSE sucursal_caja
    END AS sucursal2
  FROM `ws-ctrol-interno.CAJA_UNICA.disposicion`
  WHERE DATE(fecha_contable) >= DATE_SUB(CURRENT_DATE(), INTERVAL {dias_atras} DAY)
    AND tipo_credito = 'REVOLVENTE'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY folio ORDER BY fecha_contable DESC
  ) = 1
),

D AS (
  SELECT
    uuid, codigo, tipo_operacion, contrato, monto, validado, caducado, fecha,
    tipo_envio, destino, fecha_validacion, created_date, update_date AS update__date,
    numero_cliente, estatus_destino, fecha_notificacion
  FROM `ws-ctrol-interno.CAJA_UNICA.validacion_otp`
),

P AS (
  SELECT numero_empleado, nombre_puesto, nombre_empleado
  FROM `ws-buro-clientes.DATA_OPERATIVA.plantilla_empleados`
),

EE AS (
  SELECT CAST(cliente AS STRING) AS CLIENT, CALIFICACION
  FROM `ws-buro-clientes.DATA.evolucion_diaria_clientes`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY cliente ORDER BY fecha_informacion DESC) = 1
),

QQ AS (
  SELECT
    empresa, fecha_informacion, id_linea_credito, contrato AS CONTRACTID, capital_insoluto,
    no_pagos_vencidos, dias_vencidos, saldo_vencido, monto_colocado, monto_dev_colocado,
    monto_revolvencia, monto_dev_revolvencia, monto_seguros, monto_dev_seguro, fecha_ult_mov,
    maximo_retraso, no_ult_pago, fecha_liquidacion, bandera_castigo, status, limite_credito,
    origen, propietario, tasa, monto_pago, efectivo_recuperado, fecha_prox_pago, fecha_ult_pago,
    devengado_por_pagar, cliente AS id_clients, efectivo_recuperado_diario, monto_bonificado_diario,
    no_pagos_vencidos_proy, monto_bonificado, no_pagos_vencidos_ini_proy, id_contrato_migrado,
    bandera_lc_activa_ini, bandera_lc_activa, dias_vencidos_iniciales
  FROM `ws-buro-clientes.DATA.evolucion_diaria_lineas_credito`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY contrato ORDER BY fecha_informacion DESC) = 1
),

RR AS (
  SELECT CLIENTE, CURP, RFC
  FROM `ws-buro-clientes.DATA.clientes`
),

TT AS (
  SELECT CLIENTE, FECHA_NACIMIENTO
  FROM `ws-buro-clientes.DATA.clientes_demograficos`
),

base_data AS (
  SELECT
    HGB.*,
    RR.CURP,
    RR.RFC,
    D.destino,
    D.validado,
    D.update__date,
    D.estatus_destino,
    P.numero_empleado,
    P.nombre_puesto,
    P.nombre_empleado,
    TT.FECHA_NACIMIENTO,
    EE.CLIENT,
    EE.CALIFICACION,
    QQ.*
  FROM HGB

  LEFT JOIN D
    ON HGB.uuid_codigo_validacion = D.uuid

  LEFT JOIN P
    ON HGB.usuario_op = P.numero_empleado

  LEFT JOIN EE
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(D.NUMERO_CLIENTE, r'[^0-9]', '') AS INT64)

  LEFT JOIN QQ
    ON SAFE_CAST(REGEXP_REPLACE(HGB.CONTRATO, r'[^0-9]', '') AS INT64)
       IN (QQ.CONTRACTID, QQ.id_contrato_migrado)

  LEFT JOIN RR
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(CAST(RR.CLIENTE AS STRING), r'[^0-9]', '') AS INT64)

  LEFT JOIN TT
    ON SAFE_CAST(REGEXP_REPLACE(EE.CLIENT, r'[^0-9]', '') AS INT64) =
       SAFE_CAST(REGEXP_REPLACE(CAST(TT.CLIENTE AS STRING), r'[^0-9]', '') AS INT64)
)

-- Nota: Las columnas de banderas vienen del sheet bd_disp
-- El scoring en Python usa estas columnas para calcular risk_score
SELECT * FROM base_data
ORDER BY fecha_contable DESC
LIMIT 500
