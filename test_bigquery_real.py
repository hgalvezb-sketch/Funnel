"""
Test con datos reales de BigQuery
"""
import sys
sys.path.insert(0, 'Agent_disp_BQ_resources')

from bigquery_client import BigQueryClient
from risk_scoring import RiskScorer

print('=== TEST CON DATOS REALES DE BIGQUERY ===\n')

client = BigQueryClient()
scorer = RiskScorer()

# Query simple para obtener disposiciones recientes
query = '''
SELECT
    CONTRATO,
    total_disposicion,
    fecha_contable,
    sucursal_caja,
    usuario_op,
    tipo_dispo
FROM `ws-ctrol-interno.CAJA_UNICA.disposicion`
WHERE DATE(fecha_contable) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
    AND tipo_credito = 'REVOLVENTE'
ORDER BY fecha_contable DESC
LIMIT 10
'''

try:
    print('Ejecutando query BigQuery...')
    results = client.execute_query(query, max_results=10)

    print(f'Registros obtenidos: {len(results)}\n')

    if results:
        print('Primeras 3 disposiciones:')
        for i, r in enumerate(results[:3], 1):
            print(f'{i}. Contrato: {r.get("CONTRATO", "N/A")}')
            print(f'   Monto: ${r.get("total_disposicion", 0):,.2f} MXN')
            print(f'   Fecha: {r.get("fecha_contable", "N/A")}')
            print(f'   Sucursal: {r.get("sucursal_caja", "N/A")}')
            print()

        # Calcular scores
        print('Calculando scores de riesgo...')
        scored = scorer.score_batch(results)

        anomalias = [s for s in scored if s['risk_score'] > 0]

        print(f'\nResultados:')
        print(f'  Total disposiciones: {len(results)}')
        print(f'  Anomalias detectadas: {len(anomalias)}')

        if anomalias:
            print('\n  Top anomalias:')
            for a in anomalias[:3]:
                print(f'    - Score {a["risk_score"]}: {a["risk_level"]}')
                print(f'      Banderas activas: {a["num_flags"]}')
        else:
            print('  (No se detectaron anomalias en esta muestra)')

        print('\n' + '='*60)
        print('TEST EXITOSO: Sistema funciona con BigQuery')
        print('='*60)

    else:
        print('No se encontraron registros en los ultimos 3 dias')
        print('Esto puede ser normal si no hay operaciones recientes.')

except Exception as e:
    print(f'\nERROR: {e}')
    import traceback
    traceback.print_exc()
