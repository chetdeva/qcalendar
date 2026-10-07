# users-service and calendar-service. Built from the repo root by docker-compose.yml (ARG APP picks the folder).
FROM node:24-slim
ARG APP
WORKDIR /app
COPY ${APP}/package*.json ./
RUN npm ci --omit=dev
COPY ${APP}/src ./src
COPY ${APP}/migrations ./migrations
# /data is where calendar-service keeps its embedded database when no DATABASE_URL is given.
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["npm", "start"]
