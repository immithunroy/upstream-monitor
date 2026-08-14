FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:20-slim
# traceroute + ping (iputils-ping) are required by the trace engine
RUN apt-get update \
  && apt-get install -y --no-install-recommends traceroute iputils-ping \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
# Prisma client is generated into node_modules in the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 5020

# Apply any pending Prisma migrations before serving traffic so a deploy is a
# single `docker compose up -d --build` (idempotent — prisma tracks applied ones).
# Retries until Postgres accepts connections, then starts the server.
CMD ["sh", "-c", "i=0; until npx prisma migrate deploy; do i=$((i+1)); if [ $i -ge 30 ]; then echo 'prisma migrate deploy failed after 30 attempts'; exit 1; fi; echo 'waiting for database, retrying...'; sleep 2; done && node dist/server.js"]
