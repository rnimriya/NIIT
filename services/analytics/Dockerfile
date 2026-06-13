# Analytics service (ClickHouse sink + funnel). node:22 → stable require(ESM).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/events ./packages/events
COPY services/analytics ./services/analytics
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @neet/events build \
 && pnpm --filter @neet/analytics build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/services/analytics
EXPOSE 4008
CMD ["node", "dist/main.js"]
