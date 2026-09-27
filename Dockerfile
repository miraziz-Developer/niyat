# syntax=docker/dockerfile:1

FROM node:24-alpine AS source
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM source AS frontend-build
ARG VITE_API_MODE=server
ARG VITE_DEV_USER_ID
ARG VITE_CONTACT_EMAIL
ENV VITE_API_MODE=$VITE_API_MODE
ENV VITE_DEV_USER_ID=$VITE_DEV_USER_ID
ENV VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
RUN npm run build

FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

FROM source AS api
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start:api"]