Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/. Do task T5 only (container and deploy prep).

T5:
1. Dockerfile: Python 3.11 slim, install requirements.txt, copy backend/ and frontend/, run uvicorn on 0.0.0.0 using the PORT environment variable (default 8000).
2. .dockerignore (exclude .git, tests, caches).
3. Make sure requirements.txt lists everything the app needs (fastapi, uvicorn, httpx, pydantic).
4. README.md: short "Run locally" and "Deploy" sections with the exact commands.
5. Run the app locally with uvicorn and call /api/health and /api/radar?simulate=true with curl; show me the output. Do not deploy anything yourself.

Show your plan first and wait for my approval. Then stop.
