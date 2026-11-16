# Nova.C backend

This folder contains the API used by the Nova.C GitHub Pages frontend.

## Endpoints

- `GET /` — service information
- `GET /api/health` — health and configuration status
- `POST /api/generate` — generate C, C++, Python, or JavaScript code
- `POST /api/explain` — explain code
- `POST /api/fix` — suggest corrected code
- `POST /api/run` — execute code in the OnlineCompiler.io sandbox (Piston-compatible API)

## Deploy on Render

Create a Node web service from this repository with:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free
- Region: Singapore

Set these environment variables in Render:

- `GROQ_API_KEY` — required for generate, explain, and fix
- `GROQ_MODEL` — optional; defaults to the configured Groq model
- `ONLINECOMPILER_API_KEY` — required for Run; create a free API key from OnlineCompiler.io and keep it only in Render
- `ALLOWED_ORIGINS` — optional; defaults to the Nova.C GitHub Pages origin and localhost development origins
- `PISTON_API_URL` — optional; defaults to `https://api.onlinecompiler.io/api/v2/piston/execute`

Never put provider keys in the GitHub Pages frontend or commit them to this repository.

## Connect the frontend

After deployment, open Nova.C, tap **Backend**, and save the Render URL (for example, `https://your-service.onrender.com`).

## Security notes

The backend does not execute submitted code as a local shell process. The run endpoint forwards code to OnlineCompiler.io's isolated execution sandbox. The API key stays on the backend and must never be placed in frontend code or committed to GitHub. Avoid submitting passwords, API keys, or other private information as code or input.