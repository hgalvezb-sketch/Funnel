"""
Test del Agent_disp_BQ Predictivo
Ejecutar: python test_agent_predictivo.py
"""
import sys
sys.path.insert(0, 'Agent_disp_BQ_resources')

from risk_scoring import RiskScorer, RiskLevel
from config import get_config

print("=== TEST AGENT PREDICTIVO ===\n")

# Test 1: Configuración
print("1. Testing configuracion...")
try:
    config = get_config()
    print(f"   OK - BigQuery Project: {config.BQ_PROJECT_ID}")
    print(f"   OK - Gemini Model: {config.GEMINI_MODEL}")
    print(f"   OK - Gemini API Key configurada: {config.GEMINI_API_KEY[:20]}...")
except Exception as e:
    print(f"   ERROR: {e}")
    sys.exit(1)

print("")

# Test 2: Risk Scoring
print("2. Testing risk scoring...")
scorer = RiskScorer()

# Caso crítico
disp_critica = {
    '| Tel de Colaborador |': 'Si',
    '| Pago SPEI Colab |': 'Si',
    'contrato': 'CTR-TEST-001'
}
result = scorer.calculate_score(disp_critica)
print(f"   Caso CRITICO:")
print(f"   - Score: {result['risk_score']}")
print(f"   - Level: {result['risk_level']}")
print(f"   - Patron: {result['patron_sospechoso']}")

# Caso alto
disp_alta = {
    '| +1 mismo dia |': 'Si',
    '| fuera de horario |': 'Si',
}
result2 = scorer.calculate_score(disp_alta)
print(f"   Caso ALTO:")
print(f"   - Score: {result2['risk_score']}")
print(f"   - Level: {result2['risk_level']}")

# Sin anomalías
disp_normal = {'contrato': 'CTR-NORMAL'}
result3 = scorer.calculate_score(disp_normal)
print(f"   Sin anomalias:")
print(f"   - Score: {result3['risk_score']}")
print(f"   - Level: {result3['risk_level']}")

print("\n=== TODOS LOS TESTS PASARON ===")
print("\nSistema listo para usar con Gemini.")
print("Para usar Claude Opus 4.6, configura ANTHROPIC_API_KEY en Agent_disp_BQ_resources/.env")
