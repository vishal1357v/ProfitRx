FROM node:20-alpine AS base
RUN apk add --no-cache openssl

# --- Build Stage ---
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npx react-router build

# --- Production Runner Stage ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

CMD ["npm", "run", "docker-start"]
