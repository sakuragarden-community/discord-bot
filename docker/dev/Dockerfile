FROM node:22-bookworm

ARG UID=1000
ARG GID=1000

# SSH + strumenti utili (l'immagine full ha già python3/make/g++ per sqlite3)
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server tmux nano \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/sshd \
 && ssh-keygen -A

# Allinea l'utente "node" al tuo utente host e abilitalo al login via chiave
RUN groupmod -o -g ${GID} node \
 && usermod -o -u ${UID} -g ${GID} -s /bin/bash -p '*' node \
 && chown -R node:node /home/node \
 && echo 'cd /app' >> /home/node/.bashrc

# SSH solo con chiave, niente root
RUN sed -ri 's/^#?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config \
 && sed -ri 's/^#?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app
EXPOSE 22
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]