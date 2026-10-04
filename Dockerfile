# syntax=docker/dockerfile:1

# --- Dipendenze ---
# Immagine completa: include python3, make e g++ nel caso un modulo nativo
# (es. sqlite3) non trovi un binario precompilato e vada compilato.
FROM node:22-bookworm AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Servono anche le devDependencies: ts-node usa typescript a runtime.
RUN npm ci --no-audit --no-fund && npm cache clean --force

# --- Runtime ---
FROM node:22-bookworm-slim
WORKDIR /app

ENV TZ=Europe/Rome

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
COPY messages/ messages/
COPY setup/ setup/

# Utente non privilegiato già presente nell'immagine ufficiale di Node
USER node

# npm start → ts-node src/app.ts
CMD ["npm", "start"]
