FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
RUN npm rebuild esbuild
COPY . .
RUN npx vite build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=__PORT__ DB_PATH=/data/app.db
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
# Run as the image's unprivileged user. A new named volume takes /data's ownership from the image.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE __PORT__
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||__PORT__)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server/index.ts"]
