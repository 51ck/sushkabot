FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.2.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM oven/bun:1.2
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
COPY . .
RUN ./node_modules/.bin/tsgo --noEmit
CMD ["bun", "run", "src/index.ts"]
