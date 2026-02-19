# AI-Powered Storyboard Generator

A comprehensive AI-powered storyboard creation platform that helps users generate, edit, and manage video storyboards with intelligent assistance and image search capabilities.

## 🚀 Features

### Core Functionality
- **AI Storyboard Generation**: Create detailed storyboards using Langflow AI integration
- **Interactive Chat Assistant**: Real-time AI assistance for storyboard editing and refinement
- **Project Management**: Organize storyboards by project with persistent storage
- **Dynamic Routing**: Project-specific URLs for easy sharing and collaboration
- **Persistent Chat History**: Conversation history saved per project
- **Google Image Search**: Integrated image search with smart filtering

### Storyboard Types
- **Product Release Videos**: Compelling product announcements and launch content
- **How-to Videos**: Step-by-step tutorials and instructional content
- **Knowledge Sharing**: Educational content and training materials

## 🏗️ Project Structure
```
storyboard hackathon/
├── frontend/              # React + TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── OnboardingPage.tsx      # Project creation
│   │   │   ├── StoryboardLayout.tsx    # Main storyboard view
│   │   │   ├── StoryboardEditor.tsx    # Storyboard panel grid
│   │   │   ├── EnhancedChatbot.tsx     # AI chat interface
│   │   │   ├── ChatMessage.tsx         # Chat message component
│   │   │   ├── StoryboardPanel.tsx     # Individual story panels
│   │   │   └── ui/                     # Reusable UI components
│   │   └── lib/           # Utilities and configurations
├── backend/               # FastAPI Python backend
│   ├── app/
│   │   ├── main.py        # FastAPI application & API endpoints
│   │   ├── services/
│   │   │   └── chatbot.py # Langflow integration service
│   │   ├── utils/
│   │   │   └── image_search.py  # Google Custom Search integration
│   │   └── models/        # Data models
├── data/                  # Project storage directory
│   └── project_{id}/      # Individual project folders
│       ├── project_type{n}.json     # Project metadata
│       ├── story_{id}.json          # Individual story files
│       └── chat_history.json       # Chat conversation history
└── README.md
```

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for development and building
- **Tailwind CSS v4** for styling
- **Radix UI** for accessible components
- **React Router** for navigation
- **Lucide React** for icons

### Backend
- **FastAPI** with Python 3.x
- **Langflow** for AI storyboard generation
- **Google Custom Search API** for image search
- **Pydantic** for data validation
- **Python-dotenv** for environment management

### AI Integration
- **Langflow** for storyboard generation workflows
- **OpenAI GPT** models (via Langflow)
- **Google Gemini** (backup AI provider)

## ⚙️ Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- Google Cloud account (for image search)
- Langflow instance running

### Backend Setup

1. **Navigate to backend directory**
```bash
cd "storyboard hackathon/backend"
```

2. **Create and activate virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# Or on Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install fastapi uvicorn python-dotenv requests pydantic
```

4. **Configure environment variables**
Create a `.env` file in the backend directory:
```env
# AI Configuration
OPENAI_API_KEY=
GEMINI_API_KEY=your_gemini_key

# Langflow Configuration
LANGFLOW_API_KEY=sk-lBi7UN-5-eNxRuRFVsxVzCqNtLYYb3pmu8HhOuxGltY
LANGFLOW_HOST=localhost:7860
LANGFLOW_FLOW_ID=4440b94d-d026-467b-acc9-734d01987c3c

# Google Search Configuration
GOOGLE_CSE_API_KEY=your_google_api_key
SEARCH_ENGINE_ID=your_search_engine_id
```

5. **Run the backend server**
```bash
uvicorn app.main:app --reload --port 8001
```

### Frontend Setup

1. **Navigate to frontend directory**
```bash
cd "storyboard hackathon/frontend"
```

2. **Install dependencies**
```bash
npm install
```

3. **Run the development server**
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📡 API Endpoints

### Core Application
- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/test` - Test endpoint

### Project Management
- `POST /api/create-project` - Create new storyboard project
- `GET /api/project/{project_id}` - Get project data and stories

### AI Chat & Storyboard Generation
- `POST /api/chat` - Send message to AI chatbot
- `POST /api/chat/save` - Save chat message history
- `GET /api/chat/history/{project_id}` - Get chat history for project

### Image Search
- `POST /api/search/images` - Search for images with filters
- `GET /api/search/image?query={query}` - Get single image result

## 🎯 Usage

### Creating a Storyboard

1. **Choose Storyboard Type**: Select from Product Release, How-to, or Knowledge Sharing
2. **Describe Your Vision**: Provide detailed description of your video concept
3. **AI Generation**: Langflow AI creates structured storyboard panels
4. **Interactive Editing**: Use the chat assistant to refine and improve

### Project Navigation

- **Direct URLs**: Access projects via `/storyboard/{project_id}`
- **Project Persistence**: All data saved in organized file structure
- **Chat History**: Conversation context preserved across sessions

### Image Search Integration

- **Smart Filtering**: Automatically finds JPEG images with longest titles
- **Google Integration**: Powered by Google Custom Search API
- **Easy Integration**: Helper functions for development use

## 🗂️ Data Structure

### Project Files
```json
// project_type{n}.json
{
  "id": "project_id",
  "type": 1,
  "typeName": "How-to Video",
  "userInput": "User's description",
  "createdAt": "2025-01-20T...",
  "stories": ["story_1", "story_2"],
  "storyboard": { /* complete storyboard data */ }
}

// story_{id}.json
{
  "screen_name": "1",
  "Screen_title": "Panel Title",
  "Type": "screencast",
  "Description": "Panel description",
  "Duration": 10,
  "Notes": "Additional notes"
}

// chat_history.json
{
  "projectId": "project_id",
  "messages": [
    {
      "id": "msg_id",
      "role": "user|assistant",
      "content": "Message content",
      "createdAt": "2025-01-20T..."
    }
  ],
  "lastUpdated": "2025-01-20T..."
}
```

## 🔧 Development

### Running in Development
```bash
# Terminal 1 - Backend
cd "storyboard hackathon/backend"
source venv/bin/activate
uvicorn app.main:app --reload --port 8001

# Terminal 2 - Frontend
cd "storyboard hackathon/frontend"
npm run dev
```

### Environment Notes
- Working directory contains spaces: `/Users/huigeng/storyboard hackathon/`
- Use proper quoting in shell commands
- Frontend proxies API requests to backend (port 8001)
- Hot-reload enabled for both services

## 🚨 Troubleshooting

### Google Search API Issues
1. Enable Custom Search API in Google Cloud Console
2. Verify API key permissions and restrictions
3. Ensure Search Engine ID supports image search
4. Check daily quota limits (100 searches/day free tier)

### Langflow Connection Issues
1. Verify Langflow instance is running on specified host
2. Check API key and flow ID configuration
3. Confirm timeout settings (6+ minutes for processing)

### Project Data Issues
1. Ensure `data/` directory exists and is writable
2. Check project folder structure and permissions
3. Verify JSON file formats and schema