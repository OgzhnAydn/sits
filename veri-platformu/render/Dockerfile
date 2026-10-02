# Playwright resmi imajı — Chromium + tüm bağımlılıklar hazır gelir.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4700
CMD ["node","server.mjs"]
