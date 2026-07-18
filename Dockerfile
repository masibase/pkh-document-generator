# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps ----------
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
# install bun
RUN npm install -g bun
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
RUN bun run db:generate

# ---------- Stage 2: builder ----------
FROM deps AS builder
WORKDIR /app
COPY . .
# build the standalone Next.js output
RUN bun run build

# ---------- Stage 3: runner ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# runtime: python for PDF extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages pdfplumber pikepdf

# copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db

# ensure the sqlite db dir exists and is writable
RUN mkdir -p /app/prisma && touch /app/prisma/dev.db && chmod -R 777 /app/prisma

EXPOSE 3000
CMD ["node", "server.js"]
