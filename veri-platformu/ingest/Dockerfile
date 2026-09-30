# SİTS ingest servisleri — tek imaj, komut (producer / consumer) compose'da seçilir.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
# Varsayılan: üretici. Compose her servis için 'command' ile override eder.
CMD ["node", "producer.js"]
