# ── KROTO Web image (Next.js 14 App Router, RTL Arabic storefront + admin) ───
FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app
RUN addgroup -S kroto && adduser -S kroto -G kroto
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
USER kroto
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT}"]
