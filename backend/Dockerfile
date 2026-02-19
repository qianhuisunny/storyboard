FROM python:3.12-slim

# Match local dev relative path structure
WORKDIR /project/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ .

# Copy prompts directory (referenced by agents via relative path)
COPY prompts/ /project/prompts/

# Create data directory
RUN mkdir -p /project/data

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
