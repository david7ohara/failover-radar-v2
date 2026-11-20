Set up permissions so I am not asked for routine approvals. Use the permissions format that matches this Kiro CLI version. Check Kiro's own docs or /help for the exact file location and syntax. Do not guess. Tell me what you found before writing anything.

Allow without asking:
- Read files in this repo.
- Write only in: backend/**, frontend/**, tests/**, requirements.txt, Dockerfile, .dockerignore, README.md, KIRO_LOG.md, .kiro/specs/**, .kiro/hooks/**.
- Shell: pytest, python -m pytest, python -m venv, pip install -r requirements.txt, pip install pytest hypothesis httpx fastapi uvicorn pydantic, uvicorn backend.main:app (local run), ls, cat, head, git status, git diff, and curl only to exactly these URLs: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson, https://www.githubstatus.com/api/v2/summary.json, https://www.cloudflarestatus.com/api/v2/summary.json.

Always deny:
- Any write outside those paths, and anything inside .git.
- git commit, git push, git reset, git checkout, sudo, rm -rf, chmod, ssh, any curl or wget to other addresses, any other pip or npm install.

Everything else keeps asking. Show me the complete file and wait for my approval before saving.
