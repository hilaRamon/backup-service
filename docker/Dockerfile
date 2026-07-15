# ---- build ----
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY tsconfig.json ./
COPY src ./src
COPY config ./config

RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
  && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends mongodb-database-tools \
  && apt-get purge -y curl gnupg \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=build /app/dist ./dist

RUN useradd --create-home --uid 1001 backup \
  && chown -R backup:backup /app

USER backup

ENV NODE_ENV=production

CMD ["node", "dist/src/index.js"]
