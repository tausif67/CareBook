FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --filter @carebook/admin... --frozen-lockfile
COPY apps/admin apps/admin
ARG VITE_API_BASE_URL
ARG VITE_ENABLE_TEST_AUTH=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ENABLE_TEST_AUTH=$VITE_ENABLE_TEST_AUTH
RUN pnpm --filter @carebook/admin build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
