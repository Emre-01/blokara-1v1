# Blok İki sunucusu — bağımlılık yok, sadece Node.
# Hugging Face Spaces, Koyeb, Fly.io, Railway gibi Docker kabul eden
# ücretsiz platformlarda aynen çalışır.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY package.json ./
COPY server.cjs ./
COPY public ./public

EXPOSE 8080
USER node
CMD ["node", "server.cjs"]
