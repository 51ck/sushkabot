FROM oven/bun:1.2 AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.2.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck
CMD ["bun", "run", "src/index.ts"]
