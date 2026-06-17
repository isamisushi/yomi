FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install -g npm@11.12.1
RUN npm ci

COPY . .
RUN npm run docs:build

FROM nginx:1.27-alpine

COPY --from=build /app/docs/.vitepress/dist /usr/share/nginx/html
COPY docs/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
