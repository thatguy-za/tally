# syntax=docker/dockerfile:1

# ---- build ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
# No native modules and zero production dependencies: the adapter-node output in
# build/ is self-contained, and storage is the built-in node:sqlite (Node 22.5+,
# stable in 24). Just Node + the bundle.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/tally.sqlite
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
