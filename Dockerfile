# Builds the api-server (and its workspace dependencies: lib/db, lib/api-zod)
# and produces a small runtime image. Works on Railway, Render, Fly.io, or
# any platform that builds from a Dockerfile.
#
# Build context must be the repo root, e.g.:
#   docker build -t medschoolproffs-api .
#   docker run -p 3001:3001 --env-file .env medschoolproffs-api

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Runtime image — only what's needed to run the built server
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/artifacts/api-server/dist ./dist

# esbuild externalizes a fixed list of packages it can't safely bundle (see
# artifacts/api-server/build.mjs) — of those, only nodemailer is actually
# used here, so it needs a real install for the bundled output to `require()` it.
#
# We deliberately do NOT copy artifacts/api-server/package.json here: it uses
# pnpm-only specifiers (`workspace:*`, `catalog:`) for its other dependencies,
# which plain npm can't parse — `npm install` fails immediately on that file
# even when only installing an unrelated package. A minimal, npm-only
# package.json avoids that entirely.
RUN echo '{"name":"medschoolproffs-api-runtime","private":true,"type":"module"}' > package.json && \
    corepack enable && npm install --omit=dev nodemailer@^6.9.15

EXPOSE 3001
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
