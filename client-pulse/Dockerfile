FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Where the "Open A.V.I.A. Cockpit" link points (the Cockpit container's host port).
ARG VITE_COCKPIT_URL=http://localhost:8080
ENV VITE_COCKPIT_URL=$VITE_COCKPIT_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
