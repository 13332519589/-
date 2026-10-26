FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json README.md ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 CONTEXT_DB_PATH=/data/context.sqlite
WORKDIR /app
RUN useradd --system --uid 10001 appuser && mkdir -p /data && chown appuser:appuser /data
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","dist/src/mcp/remote.js"]
