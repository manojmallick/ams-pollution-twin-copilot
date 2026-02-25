FROM node:20-alpine
WORKDIR /app
COPY ../../package.json ../../pnpm-lock.yaml ./
COPY ../../packages ./packages
COPY . .
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm --filter './packages/*' build && pnpm --filter './services/api' build
RUN mkdir -p .data
EXPOSE 8080
CMD ["node", "services/api/dist/server.js"]
