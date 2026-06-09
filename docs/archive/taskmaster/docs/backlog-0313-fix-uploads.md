# Backlog — Fix User Uploads (PDF, Links, Text)

## Task: Fix User Upload and Source Input (PDF, Links, Text)

The OnboardingPage has a sources section where users can upload files (PDF), paste links, and add text notes. This feature is broken or incomplete and needs to be fixed.

### Requirements
- Fix PDF file upload — files should be received by backend, parsed, and content extracted for use by TopicResearcher
- Fix link paste — URLs should be fetched/scraped by backend and content used as research context
- Fix text note input — free-text notes should be passed through to the research pipeline
- All uploaded sources should be stored (DB uploads table + filesystem for files)
- Uploaded content should flow into the agent pipeline as additional context for TopicResearcher
- Error handling: show clear feedback for unsupported file types, failed URL fetches, file size limits
- Test end-to-end: upload PDF → content appears in research context → influences brief/outline

### Key files
- `frontend/src/components/OnboardingPage.tsx` — source upload UI (lines 564-708)
- `backend/app/main.py` — upload endpoints
- `backend/app/db/models.py` — Upload model
- `backend/app/services/agents/topic_researcher.py` — consumes uploaded content
- `backend/app/services/orchestrator.py` — passes sources through pipeline
