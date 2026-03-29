"""
Cliente BigQuery para Agent_disp_BQ
Ejecuta queries y retorna resultados en formato estructurado
"""
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from google.cloud import bigquery
from google.api_core import exceptions
from config import get_config


class BigQueryClient:
    """Cliente para ejecutar queries BigQuery"""

    def __init__(self):
        self.config = get_config()
        self.client = bigquery.Client(
            project=self.config.BQ_PROJECT_ID,
            location=self.config.BQ_LOCATION
        )

    def execute_query(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        max_results: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Ejecuta una query BigQuery y retorna resultados como lista de dicts

        Args:
            query: SQL query a ejecutar
            params: Parámetros para query parametrizada (opcional)
            max_results: Máximo número de resultados a retornar

        Returns:
            Lista de diccionarios con los resultados

        Raises:
            BigQueryError: Si la query falla
        """
        try:
            job_config = bigquery.QueryJobConfig()

            # Si hay parámetros, configurar query parametrizada
            if params:
                query_params = []
                for key, value in params.items():
                    param_type = self._infer_param_type(value)
                    query_params.append(
                        bigquery.ScalarQueryParameter(key, param_type, value)
                    )
                job_config.query_parameters = query_params

            # Ejecutar query
            query_job = self.client.query(query, job_config=job_config)

            # Obtener resultados
            results = []
            for row in query_job.result(max_results=max_results):
                # Convertir Row a dict
                row_dict = dict(row.items())
                # Convertir tipos no serializables
                row_dict = self._serialize_row(row_dict)
                results.append(row_dict)

            return results

        except exceptions.GoogleAPIError as e:
            raise BigQueryError(f"Error ejecutando query: {str(e)}") from e

    def execute_query_from_file(
        self,
        query_file: str,
        params: Optional[Dict[str, Any]] = None,
        max_results: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Ejecuta una query desde un archivo SQL

        Args:
            query_file: Nombre del archivo en queries/ (sin path completo)
            params: Parámetros para la query
            max_results: Máximo número de resultados

        Returns:
            Lista de diccionarios con los resultados
        """
        query_path = self.config.QUERIES_DIR / query_file

        if not query_path.exists():
            raise FileNotFoundError(f"Query file not found: {query_path}")

        with open(query_path, "r", encoding="utf-8") as f:
            query = f.read()

        # Reemplazar parámetros en el SQL si es query template
        if params:
            query = self._replace_template_params(query, params)

        return self.execute_query(query, max_results=max_results)

    def _infer_param_type(self, value: Any) -> str:
        """Infiere el tipo de parámetro BigQuery"""
        if isinstance(value, bool):
            return "BOOL"
        elif isinstance(value, int):
            return "INT64"
        elif isinstance(value, float):
            return "FLOAT64"
        elif isinstance(value, str):
            return "STRING"
        else:
            return "STRING"  # Fallback

    def _serialize_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Convierte tipos no serializables a JSON"""
        serialized = {}
        for key, value in row.items():
            if value is None:
                serialized[key] = None
            elif isinstance(value, (str, int, float, bool)):
                serialized[key] = value
            elif hasattr(value, "isoformat"):  # datetime, date
                serialized[key] = value.isoformat()
            else:
                serialized[key] = str(value)
        return serialized

    def _replace_template_params(self, query: str, params: Dict[str, Any]) -> str:
        """Reemplaza parámetros template en SQL (ej: {dias_atras})"""
        for key, value in params.items():
            placeholder = f"{{{key}}}"
            if placeholder in query:
                if isinstance(value, str):
                    query = query.replace(placeholder, f"'{value}'")
                else:
                    query = query.replace(placeholder, str(value))
        return query

    def get_query_cost_estimate(self, query: str) -> Dict[str, Any]:
        """
        Estima el costo de una query sin ejecutarla (dry run)

        Returns:
            Dict con bytes_processed y costo estimado en USD
        """
        job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)

        try:
            query_job = self.client.query(query, job_config=job_config)

            bytes_processed = query_job.total_bytes_processed
            # BigQuery pricing: $5 per TB in US region
            cost_usd = (bytes_processed / (1024**4)) * 5

            return {
                "bytes_processed": bytes_processed,
                "bytes_processed_mb": round(bytes_processed / (1024**2), 2),
                "cost_usd": round(cost_usd, 6)
            }

        except exceptions.GoogleAPIError as e:
            raise BigQueryError(f"Error en dry run: {str(e)}") from e


class BigQueryError(Exception):
    """Excepción personalizada para errores de BigQuery"""
    pass
