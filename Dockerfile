# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,target=/root/.npm npm install

FROM deps AS builder
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN mkdir -p node_modules/@buggy \
 && ln -sfn ../../packages/shared-types node_modules/@buggy/shared-types
RUN npm run build --workspace @buggy/shared-types \
 && npm run build --workspace @buggy/api \
 && npm run build --workspace @buggy/web

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3400
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --workspace @buggy/api --workspace @buggy/shared-types
RUN mkdir -p node_modules/@buggy \
 && ln -sfn ../../packages/shared-types node_modules/@buggy/shared-types
COPY --from=builder /app/apps/api/dist ./apps/api/dist
EXPOSE 3400
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
