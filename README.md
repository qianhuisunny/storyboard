# Plotline — AI-Powered Storyboard Generator

An intelligent storyboard creation platform that transforms user-provided documents, images, and requirements into professional, ready-to-use storyboards through a multi-agent AI pipeline and interactive refinement.

## Features

### Core Functionality
- **Multi-Agent Storyboard Generation**: Six specialized AI agents collaborate to produce structured storyboards (research → brief → outline → draft → timing → visuals)
- **Human-in-the-Loop Gating**: Review and approve at strategic decision points (brief and outline) before downstream generation
- **Interactive Chat Assistant**: Direct OpenAI-powered chat for storyboard editing and refinement
- **Project Management**: Persistent project storage with user authentication (Clerk)
- **Google Image Search**: Integrated image search with smart filtering for visual assets
- **Analytics & Edit Tracking**: Field-level edit tracking for prompt improvement feedback loops

### Storyboard Types
- **Product Release Videos**: Product announcements and launch content
- **How-to Videos**: Step-by-step tutorials and instructional content
- **Knowledge Sharing**: Educational content and training materials

## Tech Stack

### Frontend
- **React 19** with TypeScript and Vite
- **Tailwind CSS v4** for styling
- **Radix UI** for accessible components
- **React Router** for navigation
- **Clerk** for authentication

### Backend
- **FastAPI** with Python 3.x
- **OpenAI GPT-4o** for AI generation (direct API calls)
- **Google Custom Search API** for image search
- **Pydantic** for data validation

### AI Agent Pipeline
- **TopicResearcher** — gathers context about company/product/industry
- **BriefBuilder** — creates structured creative brief from intake + research
- **StoryboardDirector** — determines scene structure and flow
- **StoryboardWriter** — writes detailed screen-by-screen content
- **DurationCalculator** — calculates precise timing (word_count / 130 × 60s)
- **ImageResearcher** — finds visual assets for each screen

## Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The app will be at `http://localhost:3000` with API proxied to `:8001`.

### Environment Variables

Create `backend/.env`:
```env
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=your_gemini_key
GOOGLE_CSE_API_KEY=your_google_api_key
SEARCH_ENGINE_ID=your_search_engine_id
```

## Project Structure
```
storyboard-hackathon/
├── frontend/src/components/    # React components (stages, chat, editors)
├── backend/app/
│   ├── main.py                 # FastAPI endpoints
│   ├── services/
│   │   ├── agents/             # Multi-agent pipeline
│   │   ├── orchestrator.py     # Pipeline coordinator
│   │   ├── state.py            # State machine
│   │   ├── chatbot.py          # Chat assistant (direct OpenAI)
│   │   ├── analytics.py        # Usage tracking
│   │   └── edit_tracker.py     # AI vs human edit tracking
│   ├── models/                 # Pydantic data models
│   └── utils/                  # Image search, JSON extraction
├── prompts/                    # System prompts for each agent
├── data/                       # Project data (gitignored)
├── CLAUDE.md                   # Claude Code operating manual
└── PRD.md                      # Product requirements
```

## Deployment

Deployed on **Fly.io** with separate services:
```bash
fly deploy --config fly.backend.toml     # backend
fly deploy --config fly.frontend.toml    # frontend
```

## Task Management

Uses **Task Master** (`.taskmaster/tasks/tasks.json`) for task tracking and decomposition.
