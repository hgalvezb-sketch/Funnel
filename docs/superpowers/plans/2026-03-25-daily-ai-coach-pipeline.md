# Daily AI Coach — Pipeline Python (Sub-proyecto 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servicio Python en Render que recibe el digest via webhook, analiza transcripts de videos, escanea Google Sheets, genera propuestas con Claude API, crea Google Doc para NotebookLM, y deposita resultados en Sheet + GitHub.

**Architecture:** FastAPI app con pipeline secuencial de 6 pasos. Cada paso es un modulo independiente. El webhook recibe HTML del digest desde Apps Script, procesa en background, y deposita resultados en 3 destinos (Google Sheet, GitHub repo, Google Doc).

**Tech Stack:** Python 3.11, FastAPI, uvicorn, httpx, beautifulsoup4, youtube-transcript-api, anthropic, google-api-python-client, google-auth, pytest

**Spec:** `docs/superpowers/specs/2026-03-25-daily-ai-coach-design.md`

---

## File Structure

```
daily-ai-coach/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, endpoints, background pipeline
│   ├── config.py             # Settings via env vars (pydantic-settings)
│   ├── digest_parser.py      # Step 1: parsear HTML del digest
│   ├── transcripts.py        # Step 2: extraer transcripts YouTube
│   ├── sheets_scanner.py     # Step 3: barrido Google Sheets (fijos + Drive)
│   ├── analyzer.py           # Step 4: analisis Claude API
│   ├── doc_generator.py      # Step 5: crear Google Doc para NotebookLM
│   └── results_writer.py     # Step 6: escribir Sheet + GitHub
├── tests/
│   ├── __init__.py
│   ├── test_digest_parser.py
│   ├── test_transcripts.py
│   ├── test_sheets_scanner.py
│   ├── test_analyzer.py
│   ├── test_doc_generator.py
│   ├── test_results_writer.py
│   └── test_main.py
├── results/
│   └── .gitkeep
├── requirements.txt
├── render.yaml
├── .env.example
├── .gitignore
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/requirements.txt`
- Create: `C:/Users/Administrador/daily-ai-coach/.env.example`
- Create: `C:/Users/Administrador/daily-ai-coach/.gitignore`
- Create: `C:/Users/Administrador/daily-ai-coach/render.yaml`
- Create: `C:/Users/Administrador/daily-ai-coach/app/__init__.py`
- Create: `C:/Users/Administrador/daily-ai-coach/app/config.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/__init__.py`
- Create: `C:/Users/Administrador/daily-ai-coach/results/.gitkeep`

- [ ] **Step 1: Create GitHub repo and clone**

```bash
cd C:/Users/Administrador
gh repo create daily-ai-coach --private --clone
cd daily-ai-coach
```

- [ ] **Step 2: Create requirements.txt**

```
fastapi==0.115.12
uvicorn==0.34.2
httpx==0.28.1
beautifulsoup4==4.13.4
youtube-transcript-api==1.0.3
anthropic==0.52.0
google-api-python-client==2.173.0
google-auth==2.40.1
pydantic-settings==2.9.1
pytest==8.3.5
pytest-asyncio==0.25.3
```

- [ ] **Step 3: Create .env.example**

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GITHUB_TOKEN=ghp_...
GITHUB_REPO=hgalvezb-sketch/daily-ai-coach
WEBHOOK_SECRET=your-secret-here
BANCO_IDEAS_SHEET_ID=pending-creation
```

- [ ] **Step 4: Create .gitignore**

```
__pycache__/
*.pyc
.env
venv/
.venv/
results/*.json
!results/.gitkeep
.pytest_cache/
```

- [ ] **Step 5: Create render.yaml**

```yaml
services:
  - type: web
    name: daily-ai-coach
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: GOOGLE_SERVICE_ACCOUNT_JSON
        sync: false
      - key: GITHUB_TOKEN
        sync: false
      - key: GITHUB_REPO
        value: hgalvezb-sketch/daily-ai-coach
      - key: WEBHOOK_SECRET
        sync: false
      - key: BANCO_IDEAS_SHEET_ID
        sync: false
```

- [ ] **Step 6: Create app/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    google_service_account_json: str
    github_token: str
    github_repo: str = "hgalvezb-sketch/daily-ai-coach"
    webhook_secret: str
    banco_ideas_sheet_id: str

    # Sheets fijos
    sheet_calculadora_id: str = "14B1kpFukGQ0guGfYMmfnOInAi4TQDDjwla9dyFodavM"
    sheet_bd_agent_id: str = "1xbYd4b4aSfnCnrVD8VLQGPBiRTeIXAfOxpk9UP6e1c8"

    # Drive
    drive_owner_email: str = "hgalvezb@findep.com.mx"
    drive_max_extra_sheets: int = 10
    drive_lookback_days: int = 7

    # Doc
    drive_coach_folder: str = ""  # folder ID, set after creation

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 7: Create empty __init__.py files and results/.gitkeep**

```bash
mkdir -p app tests results
touch app/__init__.py tests/__init__.py results/.gitkeep
```

- [ ] **Step 8: Install dependencies and verify**

```bash
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
python -c "import fastapi, anthropic, bs4; print('OK')"
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "[POC] chore: scaffold proyecto daily-ai-coach

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Digest Parser

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/digest_parser.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_digest_parser.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_digest_parser.py
from app.digest_parser import parse_digest


SAMPLE_HTML = """
<html><body>
<h2>Daily AI Digest - 25 Mar 2026</h2>
<div class="video">
  <a href="https://www.youtube.com/watch?v=abc123">Claude Code Tips</a>
  <span class="channel">Nick Puru</span>
</div>
<div class="video">
  <a href="https://youtu.be/def456">AI Agents at Scale</a>
  <span class="channel">Google Cloud</span>
</div>
<div class="rss">
  <a href="https://anthropic.com/blog/new-feature">New Feature Launch</a>
</div>
</body></html>
"""

SAMPLE_HTML_PLAIN_LINKS = """
<html><body>
<p>Check out this video: https://www.youtube.com/watch?v=xyz789 about MCP servers</p>
<p>Also see https://youtu.be/short1 for more</p>
</body></html>
"""


def test_extracts_video_ids_from_href():
    result = parse_digest(SAMPLE_HTML)
    video_ids = [v["video_id"] for v in result["videos"]]
    assert "abc123" in video_ids
    assert "def456" in video_ids


def test_extracts_video_titles():
    result = parse_digest(SAMPLE_HTML)
    titles = [v["title"] for v in result["videos"]]
    assert "Claude Code Tips" in titles


def test_extracts_rss_links():
    result = parse_digest(SAMPLE_HTML)
    assert len(result["rss_items"]) >= 1
    assert result["rss_items"][0]["url"] == "https://anthropic.com/blog/new-feature"


def test_extracts_video_ids_from_plain_text():
    result = parse_digest(SAMPLE_HTML_PLAIN_LINKS)
    video_ids = [v["video_id"] for v in result["videos"]]
    assert "xyz789" in video_ids
    assert "short1" in video_ids


def test_empty_html_returns_empty_lists():
    result = parse_digest("<html><body></body></html>")
    assert result["videos"] == []
    assert result["rss_items"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_digest_parser.py -v`
Expected: FAIL with `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/digest_parser.py
import re
from bs4 import BeautifulSoup


YOUTUBE_URL_PATTERNS = [
    re.compile(r"youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})"),
    re.compile(r"youtu\.be/([a-zA-Z0-9_-]{11})"),
]

NON_YOUTUBE_DOMAINS = [
    "anthropic.com",
    "github.com",
    "openai.com",
]


def _extract_video_id(url: str) -> str | None:
    for pattern in YOUTUBE_URL_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    return None


def _is_rss_link(url: str) -> bool:
    return any(domain in url for domain in NON_YOUTUBE_DOMAINS)


def parse_digest(html_content: str) -> dict:
    soup = BeautifulSoup(html_content, "html.parser")
    videos = []
    seen_ids = set()
    rss_items = []

    # Extract from <a> tags
    for a_tag in soup.find_all("a", href=True):
        url = a_tag["href"]
        video_id = _extract_video_id(url)
        if video_id and video_id not in seen_ids:
            seen_ids.add(video_id)
            videos.append({
                "video_id": video_id,
                "title": a_tag.get_text(strip=True) or "",
                "url": url,
            })
        elif _is_rss_link(url):
            rss_items.append({
                "title": a_tag.get_text(strip=True) or "",
                "url": url,
            })

    # Extract video IDs from plain text (URLs not in <a> tags)
    full_text = soup.get_text()
    for pattern in YOUTUBE_URL_PATTERNS:
        for match in pattern.finditer(full_text):
            video_id = match.group(1)
            if video_id not in seen_ids:
                seen_ids.add(video_id)
                videos.append({
                    "video_id": video_id,
                    "title": "",
                    "url": match.group(0),
                })

    return {"videos": videos, "rss_items": rss_items}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_digest_parser.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/digest_parser.py tests/test_digest_parser.py
git commit -m "[POC] feat: digest HTML parser con extraccion de videos y RSS

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Transcript Extractor

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/transcripts.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_transcripts.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_transcripts.py
from unittest.mock import patch, MagicMock
from app.transcripts import get_transcripts


def test_returns_transcript_for_valid_video():
    mock_transcript = [
        {"text": "Hola, hoy vamos a hablar de Claude Code.", "start": 0.0},
        {"text": "Es una herramienta increible.", "start": 3.5},
    ]

    with patch("app.transcripts.YouTubeTranscriptApi") as mock_api:
        mock_api.get_transcript.return_value = mock_transcript
        result = get_transcripts(["abc123"])

    assert "abc123" in result
    assert "Claude Code" in result["abc123"]


def test_skips_failed_transcripts():
    with patch("app.transcripts.YouTubeTranscriptApi") as mock_api:
        mock_api.get_transcript.side_effect = Exception("No transcript")
        result = get_transcripts(["bad_id"])

    assert "bad_id" not in result


def test_handles_empty_list():
    result = get_transcripts([])
    assert result == {}


def test_tries_spanish_first_then_english():
    mock_transcript = [{"text": "Hello world", "start": 0.0}]

    with patch("app.transcripts.YouTubeTranscriptApi") as mock_api:
        mock_api.get_transcript.side_effect = [
            Exception("No Spanish"),  # first call (es)
            mock_transcript,          # second call (en)
        ]
        result = get_transcripts(["vid1"])

    assert "vid1" in result
    calls = mock_api.get_transcript.call_args_list
    assert calls[0][0] == ("vid1",)
    assert calls[0][1]["languages"] == ["es", "es-MX"]
    assert calls[1][0] == ("vid1",)
    assert calls[1][1]["languages"] == ["en"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_transcripts.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/transcripts.py
from youtube_transcript_api import YouTubeTranscriptApi


def get_transcripts(video_ids: list[str]) -> dict[str, str]:
    results = {}
    for video_id in video_ids:
        transcript_text = _fetch_transcript(video_id)
        if transcript_text:
            results[video_id] = transcript_text
    return results


def _fetch_transcript(video_id: str) -> str | None:
    # Try Spanish first, then English
    for languages in [["es", "es-MX"], ["en"]]:
        try:
            transcript = YouTubeTranscriptApi.get_transcript(
                video_id, languages=languages
            )
            return " ".join(entry["text"] for entry in transcript)
        except Exception:
            continue
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_transcripts.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/transcripts.py tests/test_transcripts.py
git commit -m "[POC] feat: extractor de transcripts YouTube (espanol > ingles)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Sheets Scanner

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/sheets_scanner.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_sheets_scanner.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_sheets_scanner.py
from unittest.mock import patch, MagicMock
from app.sheets_scanner import scan_fixed_sheets, discover_sheets, scan_sheet


def test_scan_sheet_returns_structure():
    mock_sheets_service = MagicMock()
    mock_sheets_service.spreadsheets().get().execute.return_value = {
        "properties": {"title": "Calculadora AI"},
        "sheets": [
            {"properties": {"title": "Resumen", "sheetId": 0}},
            {"properties": {"title": "Datos", "sheetId": 1}},
        ],
    }
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": [
            ["Col A", "Col B", "Col C"],
            ["val1", "val2", "val3"],
        ]
    }

    result = scan_sheet(mock_sheets_service, "fake_id")

    assert result["name"] == "Calculadora AI"
    assert len(result["tabs"]) == 2
    assert result["tabs"][0]["name"] == "Resumen"


def test_discover_sheets_filters_by_owner():
    mock_drive_service = MagicMock()
    mock_drive_service.files().list().execute.return_value = {
        "files": [
            {"id": "sheet1", "name": "Mi Sheet", "modifiedTime": "2026-03-24T10:00:00Z"},
            {"id": "sheet2", "name": "Otro Sheet", "modifiedTime": "2026-03-23T10:00:00Z"},
        ]
    }

    result = discover_sheets(mock_drive_service, "hgalvezb@findep.com.mx", days=7, max_results=10)

    assert len(result) == 2
    assert result[0]["id"] == "sheet1"


def test_discover_sheets_respects_max_results():
    mock_drive_service = MagicMock()
    files = [{"id": f"s{i}", "name": f"Sheet {i}", "modifiedTime": "2026-03-24T10:00:00Z"} for i in range(20)]
    mock_drive_service.files().list().execute.return_value = {"files": files}

    result = discover_sheets(mock_drive_service, "user@test.com", days=7, max_results=5)

    assert len(result) <= 5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_sheets_scanner.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/sheets_scanner.py
import json
from datetime import datetime, timedelta, timezone
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from app.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


def _get_credentials() -> Credentials:
    sa_info = json.loads(settings.google_service_account_json)
    return Credentials.from_service_account_info(sa_info, scopes=SCOPES)


def _build_sheets_service(credentials: Credentials = None):
    creds = credentials or _get_credentials()
    return build("sheets", "v4", credentials=creds)


def _build_drive_service(credentials: Credentials = None):
    creds = credentials or _get_credentials()
    return build("drive", "v3", credentials=creds)


def scan_sheet(sheets_service, sheet_id: str) -> dict:
    spreadsheet = sheets_service.spreadsheets().get(
        spreadsheetId=sheet_id
    ).execute()

    name = spreadsheet["properties"]["title"]
    tabs = []

    for sheet in spreadsheet.get("sheets", []):
        tab_name = sheet["properties"]["title"]
        # Read first 2 rows (headers + sample) from each tab
        try:
            range_str = f"'{tab_name}'!A1:Z2"
            values_resp = sheets_service.spreadsheets().values().get(
                spreadsheetId=sheet_id, range=range_str
            ).execute()
            rows = values_resp.get("values", [])
            headers = rows[0] if rows else []
            sample = rows[1] if len(rows) > 1 else []
        except Exception:
            headers = []
            sample = []

        tabs.append({
            "name": tab_name,
            "headers": headers,
            "sample_row": sample,
        })

    return {"id": sheet_id, "name": name, "tabs": tabs}


def discover_sheets(
    drive_service,
    owner_email: str,
    days: int = 7,
    max_results: int = 10,
) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query = (
        f"mimeType='application/vnd.google-apps.spreadsheet' "
        f"and '{owner_email}' in owners "
        f"and modifiedTime > '{cutoff}'"
    )
    resp = drive_service.files().list(
        q=query,
        fields="files(id,name,modifiedTime)",
        orderBy="modifiedTime desc",
        pageSize=max_results,
    ).execute()

    return resp.get("files", [])[:max_results]


def scan_all_sheets() -> list[dict]:
    creds = _get_credentials()
    sheets_svc = _build_sheets_service(creds)
    drive_svc = _build_drive_service(creds)

    results = []

    # Fixed sheets
    for sheet_id in [settings.sheet_calculadora_id, settings.sheet_bd_agent_id]:
        try:
            results.append(scan_sheet(sheets_svc, sheet_id))
        except Exception as e:
            results.append({"id": sheet_id, "name": "ERROR", "error": str(e), "tabs": []})

    # Auto-discovered sheets
    discovered = discover_sheets(
        drive_svc,
        settings.drive_owner_email,
        days=settings.drive_lookback_days,
        max_results=settings.drive_max_extra_sheets,
    )
    fixed_ids = {settings.sheet_calculadora_id, settings.sheet_bd_agent_id}
    for file_info in discovered:
        if file_info["id"] not in fixed_ids:
            try:
                results.append(scan_sheet(sheets_svc, file_info["id"]))
            except Exception:
                continue

    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_sheets_scanner.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/sheets_scanner.py tests/test_sheets_scanner.py
git commit -m "[POC] feat: scanner de Google Sheets (fijos + autodescubrimiento Drive)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Claude Analyzer

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/analyzer.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_analyzer.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_analyzer.py
import json
from unittest.mock import patch, MagicMock
from app.analyzer import analyze, build_prompt, SYSTEM_PROMPT


def test_build_prompt_includes_transcripts():
    prompt = build_prompt(
        digest_summary="Hoy hay 3 videos sobre Claude Code",
        transcripts={"vid1": "Este video habla de MCP servers"},
        sheets_data=[{"name": "Calculadora", "tabs": [{"name": "Resumen", "headers": ["A", "B"]}]}],
        backlog=[],
    )
    assert "MCP servers" in prompt
    assert "Calculadora" in prompt


def test_build_prompt_includes_backlog():
    prompt = build_prompt(
        digest_summary="Resumen",
        transcripts={},
        sheets_data=[],
        backlog=[{"titulo": "Idea anterior pendiente"}],
    )
    assert "Idea anterior pendiente" in prompt


def test_analyze_returns_structured_response():
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = json.dumps({
        "fecha": "2026-03-25",
        "resumen_dia": "Hoy destaca Claude Code con computer control",
        "propuestas": [
            {
                "id": 1,
                "titulo": "Automatizar descarga PDFs",
                "descripcion": "Usar Claude computer control para CIRO",
                "sheet_relacionado": "Calculadora AI",
                "video_fuente": "Claude Computer Control",
                "impacto": "alto",
                "esfuerzo": "1d",
                "plan_rapido": ["Paso 1", "Paso 2"],
                "motivacion": "Ahorra 30 min diarios"
            }
        ],
        "proyecto_recomendado": 1,
        "guion_notebooklm": "Hoy vamos a hablar de..."
    })

    with patch("app.analyzer.anthropic.Anthropic") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create.return_value = mock_response

        result = analyze(
            digest_summary="Resumen del dia",
            transcripts={"vid1": "transcript text"},
            sheets_data=[],
            backlog=[],
        )

    assert result["resumen_dia"] == "Hoy destaca Claude Code con computer control"
    assert len(result["propuestas"]) == 1
    assert result["propuestas"][0]["impacto"] == "alto"
    assert "guion_notebooklm" in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_analyzer.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/analyzer.py
import json
import anthropic

from app.config import settings

SYSTEM_PROMPT = """Eres el Daily AI Coach de un desarrollador senior en FINDEP (microfinanciera mexicana).
Tu rol es analizar el contenido del Daily AI Digest (videos, transcripts, noticias) y cruzarlo con los proyectos actuales del usuario en Google Sheets para generar propuestas de mejora accionables.

El usuario trabaja con: Java, JavaScript, HTML (Full Stack), Google Apps Script, Python (FastAPI), React, Flutter, Claude Code, y Google Cloud.

Proyectos conocidos:
- Calculadora AI & CI & RO: analisis de riesgo crediticio e indicadores
- bd_Agent_Disp: dashboard operativo con 7 pestanas en Apps Script
- CIRO: auditoria crediticia con analisis de PDFs
- Funnel Dashboard: React + Recharts para metricas
- Cedula AROS: evaluacion de riesgo operativo en sucursales
- Daily AI Digest: correo diario con videos y noticias de IA

REGLAS:
1. Genera EXACTAMENTE 5 propuestas
2. Cada propuesta debe conectar contenido del digest con un proyecto/Sheet existente
3. Incluye motivacion persuasiva para arrancar HOY
4. El plan_rapido debe tener 3-5 pasos concretos
5. Varia el esfuerzo: al menos 1 propuesta de "1h" y al menos 1 de "1d" o mas
6. Genera un guion para NotebookLM: prosa narrativa en espanol, 1500-2500 palabras, tono entusiasta pero concreto, como dos colegas tecnicos discutiendo las propuestas

Responde SOLO con JSON valido, sin markdown ni explicaciones."""

OUTPUT_SCHEMA = """{
  "fecha": "YYYY-MM-DD",
  "resumen_dia": "2-3 lineas del digest",
  "propuestas": [
    {
      "id": 1,
      "titulo": "Titulo descriptivo",
      "descripcion": "Que implementar (2-3 lineas)",
      "sheet_relacionado": "Nombre del Sheet o proyecto",
      "video_fuente": "Titulo del video que inspira",
      "impacto": "alto|medio|bajo",
      "esfuerzo": "1h|4h|1d|3d",
      "plan_rapido": ["paso 1", "paso 2", "paso 3"],
      "motivacion": "Por que arrancar HOY"
    }
  ],
  "proyecto_recomendado": 1,
  "guion_notebooklm": "Texto largo en prosa narrativa para NotebookLM..."
}"""


def build_prompt(
    digest_summary: str,
    transcripts: dict[str, str],
    sheets_data: list[dict],
    backlog: list[dict],
) -> str:
    sections = []

    sections.append(f"## Digest del dia\n{digest_summary}")

    if transcripts:
        sections.append("## Transcripts de videos")
        for vid_id, text in transcripts.items():
            # Truncate long transcripts to ~3000 chars each
            truncated = text[:3000] + "..." if len(text) > 3000 else text
            sections.append(f"### Video {vid_id}\n{truncated}")

    if sheets_data:
        sections.append("## Estado actual de Google Sheets")
        for sheet in sheets_data:
            tabs_info = ", ".join(
                f"{t['name']} ({', '.join(t.get('headers', [])[:5])})"
                for t in sheet.get("tabs", [])
            )
            sections.append(f"### {sheet.get('name', 'Sin nombre')}\nPestanas: {tabs_info}")

    if backlog:
        sections.append("## Backlog de ideas pendientes")
        for idea in backlog:
            sections.append(f"- {idea.get('titulo', 'Sin titulo')}")

    sections.append(f"## Formato de respuesta esperado\n{OUTPUT_SCHEMA}")

    return "\n\n".join(sections)


def analyze(
    digest_summary: str,
    transcripts: dict[str, str],
    sheets_data: list[dict],
    backlog: list[dict],
) -> dict:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_prompt = build_prompt(digest_summary, transcripts, sheets_data, backlog)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = response.content[0].text
    return json.loads(raw_text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_analyzer.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/analyzer.py tests/test_analyzer.py
git commit -m "[POC] feat: analizador Claude API con prompt contextualizado

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Google Doc Generator

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/doc_generator.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_doc_generator.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_doc_generator.py
from unittest.mock import patch, MagicMock
from app.doc_generator import create_coach_doc


def test_creates_doc_and_returns_url():
    mock_docs_service = MagicMock()
    mock_docs_service.documents().create().execute.return_value = {
        "documentId": "doc123",
    }

    mock_drive_service = MagicMock()

    result = create_coach_doc(
        docs_service=mock_docs_service,
        drive_service=mock_drive_service,
        date="2026-03-25",
        guion="Hoy vamos a hablar de las propuestas...",
        folder_id="folder123",
    )

    assert result["doc_id"] == "doc123"
    assert "docs.google.com" in result["url"]
    mock_docs_service.documents().create.assert_called_once()


def test_inserts_content_into_doc():
    mock_docs_service = MagicMock()
    mock_docs_service.documents().create().execute.return_value = {
        "documentId": "doc456",
    }

    mock_drive_service = MagicMock()

    create_coach_doc(
        docs_service=mock_docs_service,
        drive_service=mock_drive_service,
        date="2026-03-25",
        guion="Contenido del guion para NotebookLM",
        folder_id="folder123",
    )

    mock_docs_service.documents().batchUpdate.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_doc_generator.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/doc_generator.py
import json
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from app.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]


def _get_credentials() -> Credentials:
    sa_info = json.loads(settings.google_service_account_json)
    return Credentials.from_service_account_info(sa_info, scopes=SCOPES)


def create_coach_doc(
    docs_service,
    drive_service,
    date: str,
    guion: str,
    folder_id: str,
) -> dict:
    title = f"Daily AI Coach -- {date}"

    # Create empty doc
    doc = docs_service.documents().create(body={"title": title}).execute()
    doc_id = doc["documentId"]

    # Insert content
    requests = [
        {
            "insertText": {
                "location": {"index": 1},
                "text": guion,
            }
        }
    ]
    docs_service.documents().batchUpdate(
        documentId=doc_id, body={"requests": requests}
    ).execute()

    # Move to Coach folder
    if folder_id:
        drive_service.files().update(
            fileId=doc_id,
            addParents=folder_id,
            fields="id,parents",
        ).execute()

    return {
        "doc_id": doc_id,
        "url": f"https://docs.google.com/document/d/{doc_id}/edit",
        "title": title,
    }


def create_doc_from_analysis(date: str, guion: str) -> dict:
    creds = _get_credentials()
    docs_svc = build("docs", "v1", credentials=creds)
    drive_svc = build("drive", "v3", credentials=creds)

    return create_coach_doc(
        docs_service=docs_svc,
        drive_service=drive_svc,
        date=date,
        guion=guion,
        folder_id=settings.drive_coach_folder,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_doc_generator.py -v`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/doc_generator.py tests/test_doc_generator.py
git commit -m "[POC] feat: generador de Google Doc para NotebookLM

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Results Writer

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/results_writer.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_results_writer.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_results_writer.py
import json
from unittest.mock import patch, MagicMock
from app.results_writer import write_to_sheet, write_to_github, write_local_json


SAMPLE_RESULT = {
    "fecha": "2026-03-25",
    "resumen_dia": "Resumen test",
    "propuestas": [
        {
            "id": 1,
            "titulo": "Test proposal",
            "descripcion": "Test desc",
            "sheet_relacionado": "Test Sheet",
            "video_fuente": "Test Video",
            "impacto": "alto",
            "esfuerzo": "1h",
            "plan_rapido": ["p1", "p2"],
            "motivacion": "Test motivation",
        }
    ],
    "proyecto_recomendado": 1,
    "doc_url": "https://docs.google.com/document/d/test/edit",
}


def test_write_to_sheet_appends_rows():
    mock_sheets_service = MagicMock()

    write_to_sheet(mock_sheets_service, "sheet_id", SAMPLE_RESULT)

    mock_sheets_service.spreadsheets().values().append.assert_called_once()
    call_kwargs = mock_sheets_service.spreadsheets().values().append.call_args[1]
    assert call_kwargs["spreadsheetId"] == "sheet_id"


def test_write_to_github_creates_file():
    mock_response = MagicMock()
    mock_response.status_code = 201

    with patch("app.results_writer.httpx.put", return_value=mock_response) as mock_put:
        write_to_github(SAMPLE_RESULT, "2026-03-25")

        assert mock_put.call_count == 2  # latest.json + dated file


def test_write_local_json(tmp_path):
    output_path = tmp_path / "latest.json"
    write_local_json(SAMPLE_RESULT, str(output_path))

    with open(output_path) as f:
        saved = json.load(f)

    assert saved["fecha"] == "2026-03-25"
    assert len(saved["propuestas"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_results_writer.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/results_writer.py
import json
import base64
from pathlib import Path

import httpx
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _get_sheets_service():
    sa_info = json.loads(settings.google_service_account_json)
    creds = Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds)


def write_to_sheet(sheets_service, sheet_id: str, result: dict) -> None:
    rows = []
    for prop in result.get("propuestas", []):
        rows.append([
            result["fecha"],
            prop["id"],
            prop["titulo"],
            prop["descripcion"],
            prop.get("sheet_relacionado", ""),
            prop.get("video_fuente", ""),
            prop.get("impacto", ""),
            prop.get("esfuerzo", ""),
            json.dumps(prop.get("plan_rapido", []), ensure_ascii=False),
            prop.get("motivacion", ""),
            "pendiente",  # estado
            "",  # fecha_estado
        ])

    sheets_service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range="Ideas!A:L",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()


def write_to_github(result: dict, date: str) -> None:
    headers = {
        "Authorization": f"token {settings.github_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    content_b64 = base64.b64encode(
        json.dumps(result, ensure_ascii=False, indent=2).encode()
    ).decode()

    for path in [f"results/{date}.json", "results/latest.json"]:
        # Try to get existing file SHA for update
        sha = None
        get_url = f"https://api.github.com/repos/{settings.github_repo}/contents/{path}"
        get_resp = httpx.get(get_url, headers=headers)
        if get_resp.status_code == 200:
            sha = get_resp.json().get("sha")

        body = {
            "message": f"coach: resultados {date}",
            "content": content_b64,
        }
        if sha:
            body["sha"] = sha

        httpx.put(get_url, headers=headers, json=body)


def write_local_json(result: dict, path: str = "results/latest.json") -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def write_all_results(result: dict) -> None:
    date = result["fecha"]

    # Sheet
    sheets_svc = _get_sheets_service()
    write_to_sheet(sheets_svc, settings.banco_ideas_sheet_id, result)

    # GitHub
    write_to_github(result, date)

    # Local
    write_local_json(result)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_results_writer.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/results_writer.py tests/test_results_writer.py
git commit -m "[POC] feat: writer de resultados (Sheet + GitHub + local JSON)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: FastAPI App — Endpoints y Pipeline

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/app/main.py`
- Create: `C:/Users/Administrador/daily-ai-coach/tests/test_main.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_main.py
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


def _get_app():
    """Import app with mocked settings to avoid requiring env vars."""
    with patch("app.config.Settings") as mock_settings_cls:
        mock_settings = MagicMock()
        mock_settings.webhook_secret = "test-secret"
        mock_settings.anthropic_api_key = "sk-test"
        mock_settings.google_service_account_json = "{}"
        mock_settings.github_token = "ghp-test"
        mock_settings.github_repo = "test/repo"
        mock_settings.banco_ideas_sheet_id = "sheet-test"
        mock_settings.sheet_calculadora_id = "calc-test"
        mock_settings.sheet_bd_agent_id = "bd-test"
        mock_settings.drive_owner_email = "test@test.com"
        mock_settings.drive_max_extra_sheets = 10
        mock_settings.drive_lookback_days = 7
        mock_settings.drive_coach_folder = ""
        mock_settings_cls.return_value = mock_settings

        with patch.dict("os.environ", {
            "ANTHROPIC_API_KEY": "sk-test",
            "GOOGLE_SERVICE_ACCOUNT_JSON": "{}",
            "GITHUB_TOKEN": "ghp-test",
            "WEBHOOK_SECRET": "test-secret",
            "BANCO_IDEAS_SHEET_ID": "sheet-test",
        }):
            from app.main import app
            return app


def test_status_endpoint():
    app = _get_app()
    client = TestClient(app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["status"] == "ok"


def test_webhook_rejects_bad_secret():
    app = _get_app()
    client = TestClient(app)
    resp = client.post("/webhook/digest", json={
        "html_content": "<html></html>",
        "date": "2026-03-25",
        "subject": "Test",
        "secret": "wrong-secret",
    })
    assert resp.status_code == 403


def test_webhook_accepts_valid_secret():
    app = _get_app()
    client = TestClient(app)

    with patch("app.main.run_pipeline") as mock_pipeline:
        resp = client.post("/webhook/digest", json={
            "html_content": "<html><body>test</body></html>",
            "date": "2026-03-25",
            "subject": "Daily AI Digest",
            "secret": "test-secret",
        })

    assert resp.status_code == 202
    assert resp.json()["message"] == "Pipeline started"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_main.py -v`
Expected: FAIL with `ImportError`

- [ ] **Step 3: Write implementation**

```python
# app/main.py
import asyncio
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.digest_parser import parse_digest
from app.transcripts import get_transcripts
from app.sheets_scanner import scan_all_sheets
from app.analyzer import analyze
from app.doc_generator import create_doc_from_analysis
from app.results_writer import write_all_results

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

last_run = {"timestamp": None, "status": None, "error": None}


app = FastAPI(title="Daily AI Coach", version="1.0.0")


class DigestWebhook(BaseModel):
    html_content: str
    date: str
    subject: str
    secret: str


@app.get("/status")
def status():
    return {
        "status": "ok",
        "last_run": last_run,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/results/latest")
def get_latest_results():
    from pathlib import Path

    path = Path("results/latest.json")
    if not path.exists():
        raise HTTPException(status_code=404, detail="No results yet")

    import json
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/webhook/digest", status_code=202)
def receive_digest(payload: DigestWebhook, background_tasks: BackgroundTasks):
    if payload.secret != settings.webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid secret")

    background_tasks.add_task(
        run_pipeline, payload.html_content, payload.date
    )

    return {"message": "Pipeline started", "date": payload.date}


def run_pipeline(html_content: str, date: str) -> None:
    global last_run
    try:
        logger.info(f"Pipeline started for {date}")

        # Step 1: Parse digest
        logger.info("Step 1: Parsing digest")
        parsed = parse_digest(html_content)
        video_ids = [v["video_id"] for v in parsed["videos"]]
        logger.info(f"Found {len(video_ids)} videos, {len(parsed['rss_items'])} RSS items")

        # Step 2: Extract transcripts
        logger.info("Step 2: Extracting transcripts")
        transcripts = get_transcripts(video_ids)
        logger.info(f"Got transcripts for {len(transcripts)}/{len(video_ids)} videos")

        # Step 3: Scan sheets
        logger.info("Step 3: Scanning Google Sheets")
        sheets_data = scan_all_sheets()
        logger.info(f"Scanned {len(sheets_data)} sheets")

        # Build digest summary from parsed data
        digest_summary = _build_digest_summary(parsed, date)

        # Step 4: Analyze with Claude
        logger.info("Step 4: Analyzing with Claude API")
        result = analyze(
            digest_summary=digest_summary,
            transcripts=transcripts,
            sheets_data=sheets_data,
            backlog=[],  # TODO: read from Banco de Ideas sheet
        )

        # Step 5: Create Google Doc for NotebookLM
        logger.info("Step 5: Creating Google Doc")
        guion = result.get("guion_notebooklm", "")
        if guion:
            doc_info = create_doc_from_analysis(date, guion)
            result["doc_url"] = doc_info["url"]
            logger.info(f"Doc created: {doc_info['url']}")

        # Step 6: Write results
        logger.info("Step 6: Writing results")
        result["fecha"] = date
        write_all_results(result)

        last_run.update({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "success",
            "error": None,
        })
        logger.info(f"Pipeline completed successfully for {date}")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        last_run.update({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "error",
            "error": str(e),
        })


def _build_digest_summary(parsed: dict, date: str) -> str:
    lines = [f"Daily AI Digest del {date}"]
    lines.append(f"\nVideos encontrados: {len(parsed['videos'])}")
    for v in parsed["videos"]:
        title = v.get("title", v["video_id"])
        lines.append(f"- {title}")
    if parsed["rss_items"]:
        lines.append(f"\nNoticias RSS: {len(parsed['rss_items'])}")
        for item in parsed["rss_items"]:
            lines.append(f"- {item.get('title', item['url'])}")
    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest tests/test_main.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Run all tests together**

Run: `cd C:/Users/Administrador/daily-ai-coach && python -m pytest -v`
Expected: All tests PASS (18 total)

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "[POC] feat: FastAPI app con webhook, pipeline y endpoints

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: README y Deploy a Render

**Files:**
- Create: `C:/Users/Administrador/daily-ai-coach/README.md`

- [ ] **Step 1: Create README**

```markdown
# Daily AI Coach

Pipeline automatizado que analiza el Daily AI Digest, extrae transcripts de videos,
escanea Google Sheets, y genera propuestas de mejora contextualizadas con Claude API.

## Stack

- Python 3.11 + FastAPI
- Claude API (Sonnet) para analisis
- YouTube Transcript API
- Google APIs (Sheets, Drive, Docs)

## Endpoints

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/status` | GET | Health check |
| `/results/latest` | GET | Ultimo JSON de propuestas |
| `/webhook/digest` | POST | Recibe digest desde Apps Script |

## Setup

1. Copiar `.env.example` a `.env` y completar las variables
2. `pip install -r requirements.txt`
3. `uvicorn app.main:app --reload`

## Tests

```bash
pytest -v
```

## Deploy

Auto-deploy en Render.com via `render.yaml`.
```

- [ ] **Step 2: Push to GitHub**

```bash
git add README.md
git commit -m "[POC] docs: README del proyecto Daily AI Coach

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin master
```

- [ ] **Step 3: Create Render service**

1. Ir a https://dashboard.render.com/
2. New > Web Service > Connect `daily-ai-coach` repo
3. Configurar env vars desde `.env.example`
4. Deploy

- [ ] **Step 4: Verify deploy**

```bash
curl https://daily-ai-coach.onrender.com/status
```

Expected: `{"status": "ok", "last_run": {"timestamp": null, ...}}`

- [ ] **Step 5: Test webhook end-to-end**

```bash
curl -X POST https://daily-ai-coach.onrender.com/webhook/digest \
  -H "Content-Type: application/json" \
  -d '{"html_content": "<html><body><a href=\"https://youtube.com/watch?v=test123\">Test Video</a></body></html>", "date": "2026-03-25", "subject": "Test Digest", "secret": "YOUR_SECRET"}'
```

Expected: `{"message": "Pipeline started", "date": "2026-03-25"}`
