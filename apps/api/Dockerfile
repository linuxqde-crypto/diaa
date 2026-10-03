# ── KROTO API image (NestJS + Prisma) ────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S kroto && adduser -S kroto -G kroto
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
USER kroto
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/src/main.js"]
