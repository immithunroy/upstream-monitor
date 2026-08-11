FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
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
COPY --from=build /app/dist ./dist
EXPOSE 5020

CMD ["node", "dist/server.js"]
