#!/bin/bash
set -e

# Copia la chiave pubblica montata dall'host con i permessi richiesti da sshd
if [ -f /ssh/authorized_keys ]; then
  install -d -m 700 -o node -g node /home/node/.ssh
  install -m 600 -o node -g node /ssh/authorized_keys /home/node/.ssh/authorized_keys
fi

# Prima installazione delle dipendenze, dentro il container.
# Se fallisce, sshd parte comunque così puoi entrare e sistemare.
if [ ! -d /app/node_modules ]; then
  su node -c "cd /app && npm install" || echo "⚠️  npm install fallito: entra via SSH e controlla"
fi

# sshd in primo piano: tiene vivo il container anche se il bot va in crash
exec /usr/sbin/sshd -D -e