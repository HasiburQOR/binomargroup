# Binomar Group — the postcard mailer (sidecar behind nginx)
# Sends the contact postcard over Gmail SMTP. Reached only through the
# compose network (nginx proxies /api/ here); no port is published.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

USER node
EXPOSE 8081
CMD ["node", "server.mjs"]
