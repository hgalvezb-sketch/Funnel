"""
Sistema de Scoring de Riesgos para Agent_disp_BQ
Calcula scores basados en banderas de riesgo detectadas
"""
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass
from enum import Enum


class RiskLevel(str, Enum):
    """Niveles de riesgo"""
    CRITICO = "CRÍTICO"
    ALTO = "ALTO"
    MEDIO = "MEDIO"
    BAJO = "BAJO"


@dataclass
class RiskFlag:
    """Representa una bandera de riesgo"""
    name: str
    column_name: str
    points: int
    category: RiskLevel


# Definición de banderas de riesgo basadas en columnas del sheet bd_disp
RISK_FLAGS = [
    RiskFlag("Tel de Colaborador", "| Tel de Colaborador |", 35, RiskLevel.CRITICO),
    RiskFlag("Contratos <3min", "| != contratos en menos de 3 min |", 35, RiskLevel.CRITICO),
    RiskFlag("Pago SPEI Colab", "| Pago SPEI Colab |", 40, RiskLevel.CRITICO),
    RiskFlag("Monto duplicado", "| Monto duplicado mismo día |", 30, RiskLevel.CRITICO),
    RiskFlag("+1 mismo día", "| +1 mismo día |", 25, RiskLevel.ALTO),
    RiskFlag("Fuera horario", "| fuera de horario |", 20, RiskLevel.ALTO),
    RiskFlag("Foráneas efectivo", "| Foraneas_en_efectivo |", 20, RiskLevel.ALTO),
    RiskFlag("Tel repetido", "| Tel repetido distintos contratos |", 25, RiskLevel.ALTO),
    RiskFlag("En quincena", "| en Quincena |", 10, RiskLevel.MEDIO),
    RiskFlag("Calificación ≤5", "| Calificación <= 5 |", 15, RiskLevel.MEDIO),
    RiskFlag(">120 días", "| > 120 días |", 15, RiskLevel.MEDIO),
    RiskFlag("Disp >1K", "Disp>1k   C525", 10, RiskLevel.BAJO),
    RiskFlag("Disp >24K", "Disposiciones >24k", 12, RiskLevel.BAJO),
]

# Multiplicadores de riesgo
MULTIPLICADORES = {
    "multiple_flags": 1.5,       # 2+ flags activas
    "empleado_repetido": 2.0,    # Mismo empleado múltiples flags
    "sucursal_patron": 1.8,      # Sucursal con patrón repetido
    "cluster_temporal": 1.6      # Múltiples casos mismo día
}


class RiskScorer:
    """Calcula scores de riesgo para disposiciones"""

    def __init__(self):
        self.flags = RISK_FLAGS

    def calculate_score(self, disposicion: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calcula el score de riesgo de una disposición

        Args:
            disposicion: Dict con datos de la disposición (incluyendo columnas de banderas)

        Returns:
            Dict con score, nivel, banderas activas, etc.
        """
        active_flags = []
        total_score = 0

        # Detectar banderas activas
        for flag in self.flags:
            column_value = disposicion.get(flag.column_name)
            if column_value is not None and column_value != "":
                active_flags.append({
                    "name": flag.name,
                    "points": flag.points,
                    "category": flag.category.value
                })
                total_score += flag.points

        # Aplicar multiplicadores si aplica
        num_flags = len(active_flags)
        multiplier = 1.0

        if num_flags >= 2:
            multiplier *= MULTIPLICADORES["multiple_flags"]

        total_score = int(total_score * multiplier)

        # Determinar nivel de riesgo
        risk_level = self.categorize_risk(total_score, num_flags)

        # Identificar patrón dominante
        patron = self.identify_pattern(active_flags, disposicion)

        return {
            "risk_score": total_score,
            "risk_level": risk_level.value,
            "num_flags": num_flags,
            "active_flags": active_flags,
            "multiplier": multiplier,
            "patron_sospechoso": patron
        }

    def categorize_risk(self, score: int, num_flags: int) -> RiskLevel:
        """
        Categoriza el nivel de riesgo basado en score y número de banderas

        Args:
            score: Puntuación total de riesgo
            num_flags: Número de banderas activas

        Returns:
            RiskLevel enum
        """
        if score >= 80 or num_flags >= 3:
            return RiskLevel.CRITICO
        elif score >= 40 or num_flags >= 2:
            return RiskLevel.ALTO
        elif score >= 20:
            return RiskLevel.MEDIO
        else:
            return RiskLevel.BAJO

    def identify_pattern(
        self,
        active_flags: List[Dict[str, Any]],
        disposicion: Dict[str, Any]
    ) -> str:
        """
        Identifica el patrón de fraude dominante basado en banderas activas

        Returns:
            Descripción del patrón detectado
        """
        flag_names = [f["name"] for f in active_flags]

        # Colusión empleado-cliente
        if "Tel de Colaborador" in flag_names or "Pago SPEI Colab" in flag_names:
            return "Colusión empleado-cliente"

        # Fraccionamiento
        if "Contratos <3min" in flag_names or "+1 mismo día" in flag_names:
            return "Fraccionamiento"

        # Horario irregular
        if "Fuera horario" in flag_names:
            return "Horario irregular"

        # Identidad sintética posible
        if "Tel repetido" in flag_names:
            return "Identidad sintética posible"

        # Riesgo crediticio alto
        if "Calificación ≤5" in flag_names or ">120 días" in flag_names:
            return "Riesgo crediticio alto"

        return "Otro"

    def score_batch(self, disposiciones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Calcula scores para un batch de disposiciones

        Returns:
            Lista de disposiciones con scoring añadido
        """
        scored_disposiciones = []

        for disp in disposiciones:
            scoring = self.calculate_score(disp)
            # Combinar datos originales con scoring
            scored_disp = {**disp, **scoring}
            scored_disposiciones.append(scored_disp)

        # Ordenar por risk_score descendente
        scored_disposiciones.sort(key=lambda x: x["risk_score"], reverse=True)

        return scored_disposiciones

    def filter_by_risk_level(
        self,
        disposiciones: List[Dict[str, Any]],
        min_level: RiskLevel
    ) -> List[Dict[str, Any]]:
        """
        Filtra disposiciones por nivel mínimo de riesgo

        Args:
            disposiciones: Lista de disposiciones con scoring
            min_level: Nivel mínimo de riesgo a incluir

        Returns:
            Lista filtrada
        """
        level_order = {
            RiskLevel.BAJO: 0,
            RiskLevel.MEDIO: 1,
            RiskLevel.ALTO: 2,
            RiskLevel.CRITICO: 3
        }

        min_level_order = level_order[min_level]

        return [
            d for d in disposiciones
            if level_order.get(RiskLevel(d["risk_level"]), 0) >= min_level_order
        ]
