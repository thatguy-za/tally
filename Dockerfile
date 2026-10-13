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
# The adapter-node output in build/ is self-contained except for the few
# packages that load native or WASM files at run time and so can't be bundled:
# the OCR engine for scanned PDF statements (tesseract.js + its English data,
# all local — nothing is downloaded or sent anywhere) and the canvas that turns
# PDF pages into images for it. Storage is the built-in node:sqlite.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/tally.sqlite
# CSV imports post the reviewed rows as a JSON body; allow room for large statements
ENV BODY_SIZE_LIMIT=8M
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/build ./build
COPY --from=build /app/package.json /app/package-lock.json ./
# production dependencies only; --ignore-scripts skips an advert-printing postinstall
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
