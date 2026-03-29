"""
Script para configurar Claude API Key en Agent_disp_BQ
Ejecutar: python setup_claude_key.py
"""
import os
import sys
from pathlib import Path

def setup_claude_key():
    print("=== CONFIGURACION DE CLAUDE API KEY ===\n")

    # Verificar archivo .env
    env_file = Path("Agent_disp_BQ_resources/.env")

    if not env_file.exists():
        print("ERROR: No se encuentra Agent_disp_BQ_resources/.env")
        print("Ejecuta este script desde el directorio raiz del proyecto Funnel")
        return False

    print("Pasos para obtener tu Claude API Key:\n")
    print("1. Abre tu navegador en: https://console.anthropic.com")
    print("2. Inicia sesion con tu cuenta de Anthropic (o crea una)")
    print("3. Ve a 'API Keys' en el menu lateral")
    print("4. Click en 'Create Key'")
    print("5. Copia la API key (empieza con 'sk-ant-api03-...')")
    print("\nNOTA: La API key solo se muestra UNA VEZ. Guardala en un lugar seguro.")
    print("\n" + "="*60 + "\n")

    # Pedir API key
    api_key = input("Pega tu Claude API Key aqui (o ENTER para cancelar): ").strip()

    if not api_key:
        print("\nCancelado. No se realizaron cambios.")
        return False

    # Validar formato
    if not api_key.startswith("sk-ant-"):
        print("\nERROR: La API key debe empezar con 'sk-ant-'")
        print("Formato esperado: sk-ant-api03-...")
        return False

    # Leer .env actual
    with open(env_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Actualizar línea de ANTHROPIC_API_KEY
    updated = False
    for i, line in enumerate(lines):
        if line.startswith("ANTHROPIC_API_KEY="):
            lines[i] = f"ANTHROPIC_API_KEY={api_key}\n"
            updated = True
            break

    # Si no existía, agregarla
    if not updated:
        lines.append(f"\nANTHROPIC_API_KEY={api_key}\n")

    # Guardar
    with open(env_file, "w", encoding="utf-8") as f:
        f.writelines(lines)

    print("\n" + "="*60)
    print("EXITO: Claude API Key configurada correctamente")
    print("="*60 + "\n")

    # Test de configuración
    print("Probando configuracion...")
    sys.path.insert(0, 'Agent_disp_BQ_resources')

    try:
        from config import get_config
        config = get_config()

        print(f"  OK - Claude Model: {config.CLAUDE_MODEL}")
        print(f"  OK - API Key configurada: {config.ANTHROPIC_API_KEY[:20]}...")
        print(f"  OK - Gemini Model: {config.GEMINI_MODEL}")
        print(f"  OK - Force Gemini Only: {config.FORCE_GEMINI_ONLY}")

        print("\n" + "="*60)
        print("SISTEMA LISTO PARA USAR CLAUDE OPUS 4.6")
        print("="*60 + "\n")

        print("Puedes ejecutar ahora:")
        print("  cd Agent_disp_BQ_resources")
        print("  python analyzer.py")

        return True

    except Exception as e:
        print(f"\nERROR al cargar configuracion: {e}")
        print("Verifica que la API key sea correcta.")
        return False

if __name__ == "__main__":
    setup_claude_key()
