FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

# Build the frontend (Clerk key baked in at build time)
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
# Skip tsc type checking for deploy (use vite build only)
RUN npx vite build

# Serve with nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/nginx.conf.template

# Default backend URL (override via BACKEND_URL env var)
ENV BACKEND_URL=http://localhost:8080

EXPOSE 8080

CMD ["/bin/sh", "-c", "sed \"s|BACKEND_URL_PLACEHOLDER|${BACKEND_URL}|g\" /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
