# ──────────────────────────────────────────
# Stage 1: dependencies
# ──────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

# ──────────────────────────────────────────
# Stage 2: build
# ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Backend URL for server-side rewrites (passed as build arg)
ARG BACKEND_URL=http://backend:3001
ENV BACKEND_URL=${BACKEND_URL}

RUN npm run build

# ──────────────────────────────────────────
# Stage 3: production image (standalone)
# ──────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Next.js standalone output includes everything needed
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public 2>/dev/null || true

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
