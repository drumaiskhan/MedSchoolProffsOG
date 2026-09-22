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

# Watermark font for the secure book reader (lib/bookReader.ts looks for
# ../assets/fonts/DejaVuSans.ttf relative to dist/). A slim image has no system
# fonts, so without this the watermark would silently vanish.
COPY --from=build /repo/artifacts/api-server/assets ./assets

# ---------------------------------------------------------------------------
# Runtime dependencies
# ---------------------------------------------------------------------------

# esbuild externalizes a fixed list of packages that it cannot safely bundle
# (see artifacts/api-server/build.mjs).
#
# nodemailer, pdfjs-dist and @napi-rs/canvas are required by the bundled output
# at runtime (the last two power the secure paid-book reader; keep these
# versions in step with artifacts/api-server/package.json — two copies of
# @napi-rs/canvas break rendering), so install them here.
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
    && npm install --omit=dev nodemailer@^6.9.15 pdfjs-dist@4.10.38 @napi-rs/canvas@0.1.100

# ---------------------------------------------------------------------------
# API port
# ---------------------------------------------------------------------------

EXPOSE 3001

# ---------------------------------------------------------------------------
# Start API
# ---------------------------------------------------------------------------

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
