FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

RUN node scripts/build.js

EXPOSE 4319
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4319/api/tasks || exit 1
CMD ["node", "server.js"]
