# Multi-stage build for the AI gateway (pnpm monorepo)
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

# --- deps + build ---
FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY services/ai ./services/ai
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @neet/types build
RUN pnpm --filter @neet/ai build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/services/ai
EXPOSE 4001
CMD ["node", "dist/main.js"]
