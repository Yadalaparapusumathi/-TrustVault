# ---- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime stage -----------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV BACKEND_HOST=backend \
    BACKEND_PORT=8080
# The image's entrypoint runs envsubst on /etc/nginx/templates/*.template -> /etc/nginx/conf.d/
# Only variables defined in the environment are substituted, so nginx's own $vars are untouched.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
