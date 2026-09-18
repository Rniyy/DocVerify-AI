# ---- Build stage: compile TypeScript ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# bcrypt is a native module; these let npm compile it from source on any
# platform if a prebuilt binary isn't available for this image's arch.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: smaller image, no build tools ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# Still needs a C++ toolchain in case bcrypt has to rebuild for this stage's
# exact base image; harmless if it just uses a prebuilt binary instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist

# Uploaded files live here; docker-compose mounts a volume over this path
# so files survive container restarts (see backend/uploads in compose).
RUN mkdir -p /app/uploads/documents

EXPOSE 4000
CMD ["node", "dist/index.js"]
