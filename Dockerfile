# Builds the api-server and its workspace dependencies:
# lib/db, lib/api-zod
#
# Produces a small runtime image.
# Works on Railway, Render, Fly.io, or any platform
# that builds from a Dockerfile.
#
# Build context must be the repository root:
#
# docker build -t medschoolproffs-api .
#
# Run locally:
#
# docker run -p 3001:3001 --env-file .env medschoolproffs-api

# ---------------------------------------------------------------------------
# Base image
# ---------------------------------------------------------------------------

FROM node:22-slim AS base

RUN corepack enable

WORKDIR /repo

# ---------------------------------------------------------------------------
# Build image
# ---------------------------------------------------------------------------

FROM base AS build

# Copy the complete monorepo/workspace
COPY . .

# IMPORTANT:
# Do NOT use --frozen-lockfile here.
#
# Railway previously failed because pnpm-lock.yaml was not synchronized
# with package.json (cloudinary@^2.5.1 was missing from the lockfile).
#
# Plain pnpm install allows pnpm to resolve/update the lockfile.
RUN pnpm install

# Typecheck shared libraries first
RUN pnpm run typecheck:libs

# Build the API server
RUN pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy only the compiled API server
COPY --from=build /repo/artifacts/api-server/dist ./dist

# ---------------------------------------------------------------------------
# Runtime dependencies
# ---------------------------------------------------------------------------

# esbuild externalizes a fixed list of packages that it cannot safely bundle
# (see artifacts/api-server/build.mjs).
#
# nodemailer is required by the bundled output at runtime, so install it here.
#
# We deliberately do NOT copy:
#
# artifacts/api-server/package.json
#
# because that package uses pnpm-only specifiers such as:
#
# workspace:*
# catalog:
#
# Plain npm cannot parse those specifiers.
#
# Instead, create a minimal runtime package.json and install only the package
# actually required by the compiled server.

RUN echo '{"name":"medschoolproffs-api-runtime","private":true,"type":"module"}' > package.json \
    && npm install --omit=dev nodemailer@^6.9.15

# ---------------------------------------------------------------------------
# API port
# ---------------------------------------------------------------------------

EXPOSE 3001

# ---------------------------------------------------------------------------
# Start API
# ---------------------------------------------------------------------------

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
