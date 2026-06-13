# Notifications service. node:22 → stable require(ESM).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY services/notifications ./services/notifications
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @neet/types build \
 && pnpm --filter @neet/shared build \
 && pnpm --filter @neet/db build \
 && pnpm --filter @neet/notifications build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/services/notifications
EXPOSE 4007
CMD ["node", "dist/main.js"]
