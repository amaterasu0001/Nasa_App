FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Read by dist/db/migrate.js (the `migrate` / `seed` compose services).
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
