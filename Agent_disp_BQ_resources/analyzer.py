"""
Analyzer Principal - Orquestador del pipeline predictivo
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from bigquery_client import BigQueryClient, BigQueryError
from risk_scoring import RiskScorer, RiskLevel
from llm_router import LLMRouter
from prompts import build_conversational_response
from config import get_config


console = Console()


class PredictiveAnalyzer:
    """Orquestador principal del análisis predictivo"""

    def __init__(self):
        self.config = get_config()
        self.bq_client = BigQueryClient()
        self.scorer = RiskScorer()
        self.llm_router = LLMRouter()

    def analyze_periodo(
        self,
        dias_atras: int = 3,
        max_results: int = 500
    ) -> Dict[str, Any]:
        """
        Analiza disposiciones de los últimos N días

        Args:
            dias_atras: Número de días atrás a analizar
            max_results: Máximo de resultados a procesar

        Returns:
            Dict con análisis completo
        """
        console.print(f"\n[bold blue]Analizando disposiciones últimos {dias_atras} días...[/bold blue]")

        # 1. Ejecutar query BigQuery
        try:
            params = {"dias_atras": dias_atras}
            disposiciones = self.bq_client.execute_query_from_file(
                "base_disposiciones.sql",
                params=params,
                max_results=max_results
            )
        except (BigQueryError, FileNotFoundError) as e:
            console.print(f"[red]❌ Error ejecutando query: {str(e)}[/red]")
            return {"error": str(e)}

        if not disposiciones:
            console.print("[yellow]No se encontraron disposiciones en el periodo.[/yellow]")
            return {"total": 0, "anomalias": []}

        console.print(f"[green]✓ {len(disposiciones)} disposiciones obtenidas[/green]")

        # 2. Calcular scoring
        console.print("[blue]Calculando scores de riesgo...[/blue]")
        scored_disposiciones = self.scorer.score_batch(disposiciones)

        # 3. Filtrar anomalías (score > 0)
        anomalias = [d for d in scored_disposiciones if d["risk_score"] > 0]

        if not anomalias:
            console.print("[green]✓ No se detectaron anomalías.[/green]")
            return {
                "total": len(disposiciones),
                "anomalias": [],
                "mensaje": "No se detectaron anomalías en el periodo analizado."
            }

        console.print(f"[yellow]⚠️  {len(anomalias)} anomalías detectadas[/yellow]")

        # 4. Categorizar por nivel de riesgo
        criticas = [a for a in anomalias if a["risk_level"] == RiskLevel.CRITICO.value]
        altas = [a for a in anomalias if a["risk_level"] == RiskLevel.ALTO.value]
        medias = [a for a in anomalias if a["risk_level"] == RiskLevel.MEDIO.value]

        self._print_summary_table(len(disposiciones), criticas, altas, medias)

        # 5. Análisis con LLM
        analisis_llm = {}

        if criticas:
            console.print("\n[bold red]Analizando casos CRÍTICOS con LLM...[/bold red]")
            analisis_llm["criticos"] = self._analyze_with_llm(criticas, RiskLevel.CRITICO)

        if altas and len(altas) <= 20:  # Solo si no son muchos
            console.print("\n[bold yellow]Screening casos ALTOS con LLM...[/bold yellow]")
            analisis_llm["altos"] = self._analyze_with_llm(altas, RiskLevel.ALTO)

        # 6. Generar respuesta conversacional
        respuesta = self._build_conversational_output(
            total=len(disposiciones),
            anomalias={
                "criticas": criticas,
                "altas": altas,
                "medias": medias
            },
            analisis_llm=analisis_llm,
            periodo_dias=dias_atras
        )

        # 7. Guardar log
        self._save_log({
            "timestamp": datetime.now().isoformat(),
            "periodo_dias": dias_atras,
            "total_disposiciones": len(disposiciones),
            "total_anomalias": len(anomalias),
            "criticas": len(criticas),
            "altas": len(altas),
            "medias": len(medias),
            "analisis_llm": analisis_llm
        })

        return {
            "total": len(disposiciones),
            "anomalias": anomalias,
            "analisis": analisis_llm,
            "respuesta_conversacional": respuesta
        }

    def _analyze_with_llm(
        self,
        disposiciones: List[Dict[str, Any]],
        nivel: RiskLevel
    ) -> Optional[Dict[str, Any]]:
        """Analiza disposiciones con el LLM apropiado"""

        if not disposiciones:
            return None

        # Tomar score más alto para decisión de modelo
        max_score = max(d["risk_score"] for d in disposiciones)
        max_flags = max(d["num_flags"] for d in disposiciones)

        # Decidir modelo
        modelo = self.llm_router.decide_model(max_score, max_flags)

        if modelo is None:
            console.print("[dim]Análisis LLM omitido por configuración.[/dim]")
            return None

        try:
            if modelo == "claude":
                console.print("[blue]Usando Claude Opus 4.6...[/blue]")
                return self.llm_router.analyze_with_claude(disposiciones)
            else:  # gemini
                console.print("[blue]Usando Gemini 2.5 Flash...[/blue]")
                return self.llm_router.analyze_with_gemini(disposiciones)
        except Exception as e:
            console.print(f"[red]Error en análisis LLM: {str(e)}[/red]")
            return None

    def _print_summary_table(
        self,
        total: int,
        criticas: List,
        altas: List,
        medias: List
    ):
        """Imprime tabla resumen de anomalías"""
        table = Table(title="Resumen de Anomalías")
        table.add_column("Nivel", style="cyan")
        table.add_column("Cantidad", style="magenta")
        table.add_column("% del Total", style="green")

        table.add_row("🔴 CRÍTICO", str(len(criticas)), f"{len(criticas)/total*100:.1f}%")
        table.add_row("🟡 ALTO", str(len(altas)), f"{len(altas)/total*100:.1f}%")
        table.add_row("🟠 MEDIO", str(len(medias)), f"{len(medias)/total*100:.1f}%")
        table.add_row("TOTAL", str(len(criticas)+len(altas)+len(medias)), f"{(len(criticas)+len(altas)+len(medias))/total*100:.1f}%")

        console.print(table)

    def _build_conversational_output(
        self,
        total: int,
        anomalias: Dict[str, List],
        analisis_llm: Dict[str, Any],
        periodo_dias: int
    ) -> str:
        """Construye respuesta conversacional final"""

        criticas = anomalias["criticas"]
        altas = anomalias["altas"]
        medias = anomalias["medias"]

        output = f"\nAnalicé {total} disposiciones (últimos {periodo_dias} días).\n\n"

        # Sección críticas
        if criticas:
            output += f"🔴 **{len(criticas)} ALERTA(S) CRÍTICA(S)**\n\n"
            if "criticos" in analisis_llm and analisis_llm["criticos"]:
                output += build_conversational_response(
                    analisis_llm["criticos"],
                    "CRÍTICO"
                )
            else:
                # Listado simple sin LLM
                for c in criticas[:3]:  # Top 3
                    output += f"- Score {c['risk_score']}: {c['patron_sospechoso']}\n"
                    output += f"  Banderas: {', '.join([f['name'] for f in c['active_flags']])}\n"

        # Sección altas
        if altas:
            output += f"\n🟡 **{len(altas)} caso(s) de riesgo ALTO**\n"
            if "altos" in analisis_llm and analisis_llm["altos"]:
                output += build_conversational_response(
                    analisis_llm["altos"],
                    "ALTO"
                )
            else:
                output += f"Requieren atención en próximas 24-48 horas.\n"

        # Sección medias
        if medias:
            output += f"\n🟢 {len(medias)} caso(s) de riesgo MEDIO en monitoreo.\n"

        output += "\n" + "="*60 + "\n"
        output += "\n¿Deseas que profundice en algún caso específico o que analice el histórico de alguna sucursal/empleado?\n"

        return output

    def _save_log(self, data: Dict[str, Any]):
        """Guarda log del análisis"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = self.config.LOGS_DIR / f"analisis_{timestamp}.json"

        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    """Entry point para testing"""
    analyzer = PredictiveAnalyzer()

    # Análisis de últimos 3 días
    resultado = analyzer.analyze_periodo(dias_atras=3)

    # Imprimir respuesta conversacional
    if "respuesta_conversacional" in resultado:
        console.print(Panel(
            resultado["respuesta_conversacional"],
            title="Análisis Predictivo - Agent_disp_BQ",
            border_style="blue"
        ))


if __name__ == "__main__":
    main()
