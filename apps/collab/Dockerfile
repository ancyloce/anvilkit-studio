# Production Hocuspocus relay for the AnvilKit docs playground.
# Standalone image — built from services/collab-relay only (this dir is
# NOT a pnpm workspace member). See README.md for the Fly.io runbook.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install deps first for layer caching. All deps are runtime (no dev).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server.mjs ./

# Hocuspocus listens on $PORT; Fly's http_service maps 443 -> this.
ENV PORT=1234
EXPOSE 1234

# Drop to the image's built-in non-root user.
USER node

CMD ["node", "server.mjs"]
