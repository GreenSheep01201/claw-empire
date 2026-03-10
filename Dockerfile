# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
ARG VITE_BASE_PATH=/claw-empire/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}


COPY . .
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8790
ENV VITE_BASE_PATH=/claw-empire/
ENV HOME=/home/opc

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=build /app/dist ./dist

RUN mkdir -p /runtime/db /runtime/logs /runtime/tmp /home/opc \
  && chown -R 1000:1000 /app /runtime /home/opc

USER 1000:1000

EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8790/healthz || exit 1

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
