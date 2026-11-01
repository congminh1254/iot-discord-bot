FROM node:26-bookworm-slim

# Chromium renders the /iot profile cards; fonts cover Vietnamese text.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends chromium fonts-noto-core ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
	PUPPETEER_SKIP_DOWNLOAD=true \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Node 26 runs the TypeScript sources directly (type stripping), so there is no build step.
COPY src ./src
COPY templates ./templates

USER node
EXPOSE 8080
CMD ["node", "src/main.ts"]
