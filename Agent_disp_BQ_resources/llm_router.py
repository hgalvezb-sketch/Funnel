"""
Router LLM - Decide qué modelo usar (Claude vs Gemini) y ejecuta análisis
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from anthropic import Anthropic
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from config import get_config
from prompts import build_claude_critical_prompt, build_gemini_screening_prompt


class LLMRouter:
    """Router que decide entre Claude Opus 4.6 y Gemini 2.5 Flash"""

    def __init__(self):
        self.config = get_config()

        # Inicializar clientes
        self.claude_client = Anthropic(api_key=self.config.ANTHROPIC_API_KEY)
        genai.configure(api_key=self.config.GEMINI_API_KEY)

        # Tracking de uso
        self.usage_file = self.config.LOGS_DIR / "usage_monthly.json"

    def decide_model(
        self,
        risk_score: int,
        num_flags: int
    ) -> Optional[str]:
        """
        Decide qué modelo LLM usar basándose en score y configuración

        Args:
            risk_score: Score de riesgo calculado
            num_flags: Número de banderas activas

        Returns:
            "claude" | "gemini" | None (skip LLM)
        """
        # Opción 1: Forzar solo Gemini (ahorro)
        if self.config.FORCE_GEMINI_ONLY:
            return "gemini"

        # Opción 2: Casos críticos
        if risk_score >= self.config.CRITICAL_THRESHOLD or num_flags >= 3:
            # Verificar límite mensual de Claude
            if not self._check_claude_budget():
                print("⚠️ Límite mensual de Claude alcanzado. Usando Gemini.")
                return "gemini"

            # Opción 3: Pedir confirmación si está configurado
            if self.config.CONFIRM_BEFORE_CLAUDE:
                confirmar = input(
                    f"\nDetecté {num_flags} anomalías críticas (score={risk_score}).\n"
                    f"Análisis con Claude Opus 4.6 (costo ~$0.25).\n"
                    f"¿Proceder? [C]laude / [G]emini / [S]kip: "
                )
                if confirmar.upper() == 'C':
                    return "claude"
                elif confirmar.upper() == 'G':
                    return "gemini"
                else:
                    return None  # Skip análisis LLM

            return "claude"

        # Casos de riesgo alto/medio
        elif risk_score >= self.config.HIGH_THRESHOLD:
            return "gemini"

        # Casos de bajo riesgo: skip LLM
        else:
            return None

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_with_claude(
        self,
        disposiciones: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones críticas con Claude Opus 4.6

        Returns:
            Dict con análisis estructurado en JSON
        """
        prompt = build_claude_critical_prompt(disposiciones)

        try:
            response = self.claude_client.messages.create(
                model=self.config.CLAUDE_MODEL,
                max_tokens=4000,
                temperature=0.3,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            # Extraer JSON del contenido
            content = response.content[0].text
            analisis = self._extract_json(content)

            # Registrar uso
            self._track_usage("claude", response.usage.input_tokens, response.usage.output_tokens)

            return analisis

        except Exception as e:
            print(f"❌ Error en Claude API: {str(e)}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_with_gemini(
        self,
        disposiciones: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones con Gemini 2.5 Flash

        Returns:
            Dict con análisis estructurado en JSON
        """
        prompt = build_gemini_screening_prompt(disposiciones)

        try:
            model = genai.GenerativeModel(self.config.GEMINI_MODEL)

            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.3,
                    max_output_tokens=2048
                )
            )

            # Parsear JSON
            analisis = json.loads(response.text)

            # Registrar uso (estimado)
            self._track_usage("gemini", estimated_input_tokens=len(prompt)//4, estimated_output_tokens=len(response.text)//4)

            return analisis

        except Exception as e:
            print(f"❌ Error en Gemini API: {str(e)}")
            raise

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extrae JSON del texto de respuesta"""
        # Intentar parsear directamente
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Buscar JSON entre code blocks
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            json_text = text[start:end].strip()
            return json.loads(json_text)

        # Buscar JSON entre llaves
        if "{" in text and "}" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            json_text = text[start:end]
            return json.loads(json_text)

        raise ValueError("No se pudo extraer JSON de la respuesta")

    def _check_claude_budget(self) -> bool:
        """Verifica si hay presupuesto disponible para Claude"""
        mes_actual = datetime.now().strftime("%Y-%m")

        try:
            if self.usage_file.exists():
                with open(self.usage_file, "r") as f:
                    tracking = json.load(f)

                if mes_actual in tracking:
                    claude_calls = tracking[mes_actual].get("claude_calls", 0)
                    if claude_calls >= self.config.MAX_CLAUDE_CALLS_PER_MONTH:
                        return False
        except Exception:
            pass  # Si hay error, permitir uso

        return True

    def _track_usage(
        self,
        modelo: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        estimated_input_tokens: int = 0,
        estimated_output_tokens: int = 0
    ):
        """Registra uso de LLM para tracking de costos"""
        mes_actual = datetime.now().strftime("%Y-%m")

        # Calcular costo estimado
        if modelo == "claude":
            # Claude Opus 4.6: $15/MTok input, $75/MTok output
            cost = (input_tokens / 1_000_000) * 15 + (output_tokens / 1_000_000) * 75
            tokens_in = input_tokens
            tokens_out = output_tokens
        else:  # gemini
            # Gemini Flash: gratis hasta 15 RPM, luego ~$0.075/MTok input, $0.30/MTok output
            cost = (estimated_input_tokens / 1_000_000) * 0.075 + (estimated_output_tokens / 1_000_000) * 0.30
            tokens_in = estimated_input_tokens
            tokens_out = estimated_output_tokens

        # Cargar tracking
        if self.usage_file.exists():
            with open(self.usage_file, "r") as f:
                tracking = json.load(f)
        else:
            tracking = {}

        if mes_actual not in tracking:
            tracking[mes_actual] = {
                "claude_calls": 0,
                "claude_cost_usd": 0,
                "claude_tokens_in": 0,
                "claude_tokens_out": 0,
                "gemini_calls": 0,
                "gemini_cost_usd": 0,
                "gemini_tokens_in": 0,
                "gemini_tokens_out": 0,
                "total_cost_usd": 0
            }

        # Actualizar
        if modelo == "claude":
            tracking[mes_actual]["claude_calls"] += 1
            tracking[mes_actual]["claude_cost_usd"] += cost
            tracking[mes_actual]["claude_tokens_in"] += tokens_in
            tracking[mes_actual]["claude_tokens_out"] += tokens_out
        else:
            tracking[mes_actual]["gemini_calls"] += 1
            tracking[mes_actual]["gemini_cost_usd"] += cost
            tracking[mes_actual]["gemini_tokens_in"] += tokens_in
            tracking[mes_actual]["gemini_tokens_out"] += tokens_out

        tracking[mes_actual]["total_cost_usd"] = (
            tracking[mes_actual]["claude_cost_usd"] +
            tracking[mes_actual]["gemini_cost_usd"]
        )

        # Guardar
        self.usage_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.usage_file, "w") as f:
            json.dump(tracking, f, indent=2)
