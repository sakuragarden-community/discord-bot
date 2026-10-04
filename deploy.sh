#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Tag immagine mancante}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Tag non valido" >&2; exit 1; }

cd /var/www/kodama-nest/discord-bot
COMPOSE="docker compose -f docker-compose.prod.yml"

# Rete condivisa con Kodama API (idempotente)
docker network inspect kodama-nest > /dev/null 2>&1 || docker network create kodama-nest

grep -q '^BOT_TAG=' .env || echo "BOT_TAG=" >> .env
PREV_TAG="$(grep -m1 '^BOT_TAG=' .env | cut -d= -f2-)"

sed -i "s/^BOT_TAG=.*/BOT_TAG=${TAG}/" .env
$COMPOSE pull bot
$COMPOSE up -d bot

# Il bot non espone HTTP: il controllo è che il container resti in piedi
# senza riavvii dopo il login su Discord (ts-node compila all'avvio).
sleep 30
STATE="$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$($COMPOSE ps -q bot)")"

if [[ "$STATE" != "running 0" ]]; then
  echo "Bot non stabile (stato/riavvii: ${STATE})" >&2
  $COMPOSE logs --tail=100 bot
  if [[ -n "$PREV_TAG" && "$PREV_TAG" != "$TAG" ]]; then
    echo "Rollback a ${PREV_TAG}" >&2
    sed -i "s/^BOT_TAG=.*/BOT_TAG=${PREV_TAG}/" .env
    $COMPOSE up -d bot
  fi
  exit 1
fi

# Verifica del collegamento con Kodama API (non bloccante)
if $COMPOSE exec -T bot node -e \
  "fetch('http://kodama-api:8080/actuator/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Kodama API raggiungibile da kodama-api:8080"
else
  echo "ATTENZIONE: Kodama API non raggiungibile dal bot" >&2
fi

echo "Discord bot ${TAG} attivo"
docker image prune -f
