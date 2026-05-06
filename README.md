# Theme Documentation Guide Chatbot

This repository contains a documentation-guided chatbot (RAG) for Theme-Sky themes. It provides a frontend (Next.js) UI and a Python FastAPI backend that performs retrieval-augmented generation (RAG) using pre-embedded documentation and configurable LLM providers.

---

## Project Overview

- Frontend: Next.js + React (TypeScript). Provides chat UI, session management, model & theme selection, and a small API proxy to the backend.
- Backend: FastAPI (Python). Loads FAISS vector stores, retrieves relevant document chunks, and calls LLMs to generate answers constrained to documentation context.
- RAG data: Preprocessed JSON files under `backend/data/raw/` and FAISS indices under `backend/data/processed/*/faiss_index`.
- Persistence: Lightweight conversation history via `backend/db.py` (used to persist sessions/messages).

## Technologies

- Frontend
	- Next.js (App Router)
	- React + TypeScript
	- Tailwind CSS for styling
	- lucide-react for icons

- Backend
	- Python 3.10+ (recommended)
	- FastAPI for HTTP API
	- Uvicorn for ASGI server
	- python-dotenv for environment variable loading
	- langchain-core / community integrations for documents and vectorstores
	- langchain_huggingface, langchain_openai, langchain_google_genai wrappers (light integrations used in this project)
	- FAISS vectorstore via `langchain_community.vectorstores.FAISS`

- Embeddings
	- `BAAI/bge-m3` via Hugging Face endpoint used for creating embeddings (configured in `rag_service.py`).

- Model Providers / LLMs (configured / supported)
	- Hugging Face endpoints (preferred when available)
	- OpenRouter (via OpenRouter API)
	- OpenAI (via OpenAI API)
	- Google Generative AI (via Google API)

Notes on provider ordering: When a model name without a provider prefix is used, the backend attempts providers in this order: Hugging Face → OpenRouter → OpenAI → Google. Explicit provider prefixes (e.g. `OPENAI:gpt-...`) will force the chosen provider.

## Environment Variables

Create a `.env` file in the repository root (or set environment variables via your platform) with the following keys as needed:

- `HUGGINGFACE_API_KEY` — Hugging Face Hub / endpoint token (required for embeddings and HF models)
- `OPENROUTER_API_KEY` — OpenRouter API key (optional; used for OpenRouter models)
- `OPENAI_API_KEY` — OpenAI API key (optional)
- `GOOGLE_API_KEY` — Google Generative API key (optional)
- `BACKEND_URL` — (Optional) when running the frontend dev server and proxying to a remote backend
- `APP_URL` — (Optional) used for headers when calling OpenRouter

Optional fallback model environment variables (used when no provider prefix is specified and a provider is attempted):

- `OPENROUTER_FALLBACK_MODEL` (default: `openrouter/free`)
- `OPENAI_FALLBACK_MODEL` (default: `gpt-4o-mini`)
- `GOOGLE_FALLBACK_MODEL` (default: `gemini-2.5-flash`)

## Project Structure (key files)

- `frontend/` — Next.js app and components
	- `components/chat/` — chat UI components (`ChatInterface.tsx`, `ChatMessage.tsx`, `Sidebar.tsx`, `ProviderSelector.tsx`, `ThemeSelector.tsx`)
	- `app/api/` — frontend API proxy routes that call the Python backend (`/api/chat`, `/api/theme/unlock`)

- `backend/` — FastAPI application and RAG logic
	- `main.py` — FastAPI app entrypoint (routes: `/chat`, `/theme/unlock`)
	- `rag_service.py` — vector DB init, embeddings, retriever, context builder
	- `db.py` — lightweight persistence for conversation history
	- `data/raw/` — raw JSON docs used for embeddings
	- `data/processed/` — per-theme FAISS indices and tracking files

## How It Works (high level)

1. The backend loads preprocessed JSON documentation into RAM (optional) and loads per-theme FAISS indices from `backend/data/processed/<theme>/faiss_index`.
2. When a user sends a question, the backend retrieves relevant document chunks using FAISS and constructs a context block.
3. The backend builds a system prompt constrained to the documentation context and calls an LLM to generate the answer.
4. The response and referenced documents (metadata) are returned to the frontend for display.

The system prompt requires the assistant to answer strictly based on provided documentation; if documentation is insufficient, the assistant returns the configured ticket message pointing to the Theme-Sky support center.

## Running Locally

Prerequisites:

- Python 3.10+ and virtualenv (for backend)
- Node.js 18+ and npm/yarn (for frontend)
- Ensure your `.env` keys are set (see Environment Variables)

Backend (Python / FastAPI):

1. Create and activate a virtual environment:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
```

2. Install Python dependencies:

```powershell
pip install -r requirements.txt
```

3. (Optional) If you need to prepare embeddings / FAISS indices, run your crawl/embedding workflow. The repo contains `crawl_data/crawl.py` to produce raw JSON into `backend/data/raw/`.

4. Start the backend server (development):

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (Next.js):

1. Install dependencies:

```bash
cd frontend
npm install
# or: pnpm install / yarn
```

2. Start Next dev server:

```bash
npm run dev
# default port: 3000
```

The frontend proxies requests to the backend using `BACKEND_URL` if set; otherwise it defaults to `http://localhost:8000`.

## Notes on Model Selection and Fallback

- If you pass a model with a provider prefix (e.g. `OPENAI:gpt-5.5` or `GOOGLE:gemini-2.5-flash`), the backend will attempt that provider only.
- If you pass a model name without a prefix, the backend will attempt providers in this order: Hugging Face → OpenRouter → OpenAI → Google. Each provider will be attempted until one succeeds.
- If all providers fail, the backend returns the user-facing message: "The system is currently experiencing issues. Please try again later or open a ticket at https://skygroup.ticksy.com/."

## Troubleshooting

- If embeddings or FAISS indices are missing, run the crawler and embedding scripts to populate `backend/data/raw` and `backend/data/processed`.
- Check logs on the backend for provider initialization errors — the backend prints which provider initialization failed and why.
- Ensure API keys are valid and have the correct permissions/quota.

## License

Copyright (c) 2026 Chau Huynh Phuc

Permission is hereby granted to use, copy, modify, and distribute this software for any purpose, including commercial use, provided that proper credit is given to the original author.

Attribution must include:
- The author's name
- A link to the original project (if available)

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.