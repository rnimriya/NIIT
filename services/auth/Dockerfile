# Auth service (pnpm monorepo). node:22 → stable require(ESM) + modern runtime.
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY services/auth ./services/auth
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @neet/types build \
 && pnpm --filter @neet/shared build \
 && pnpm --filter @neet/db build \
 && pnpm --filter @neet/auth build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/services/auth
EXPOSE 4002
CMD ["node", "dist/main.js"]
