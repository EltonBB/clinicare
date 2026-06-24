# Vela WhatsApp worker — the 24/7 Baileys socket service.
#
# Build context = this directory (services/whatsapp-worker). The SAME image runs
# on Railway / Render / Fly today and AWS ECS/Fargate later, unchanged.
FROM node:22-bookworm

# Tools some deps need at install time: git (libsignal is a git dependency),
# plus build tooling in case a native module compiles.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. `postinstall` runs `prisma generate`
# against ./prisma/schema.prisma. NODE_ENV is not yet "production" here, so dev
# deps (prisma, tsx, typescript) are installed for generate + the tsx runtime.
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# The `libsignal` git dependency is pinned to an ssh URL in the lockfile;
# rewrite github ssh → https so `npm install` can clone it without an SSH key.
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
  && git config --global url."https://github.com/".insteadOf "git@github.com:"

RUN npm install

# Application source.
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# The host (Railway/Render) injects PORT; the worker reads it (default 8081).
EXPOSE 8081

CMD ["npm", "start"]
