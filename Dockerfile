# One image for the whole site: the API server also serves the built web app.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# The Vite config requires PORT and BASE_PATH even for a production build.
RUN PORT=8080 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/hackathon run build \
 && pnpm --filter @workspace/api-server run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# The server is a single bundled file, so no node_modules are needed. Keep the
# repo's folder layout: the server finds the web build and the information
# packet by paths relative to its own file.
COPY --from=build /app/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /app/artifacts/hackathon/dist/public artifacts/hackathon/dist/public
COPY --from=build /app/attached_assets attached_assets
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
