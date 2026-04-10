FROM node:20-alpine AS frontend-build

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm config set registry "${NPM_REGISTRY}" \
  && npm ci

COPY frontend ./
RUN npm run build

FROM node:20-alpine AS backend-deps

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm config set registry "${NPM_REGISTRY}" \
  && npm ci --omit=dev

FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend-dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

WORKDIR /app/backend

CMD ["node", "src/server.js"]
