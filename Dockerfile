FROM node:17
WORKDIR /app

COPY package*.json ./
RUN apt update && apt install -y chromium
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD [ "npm", "start" ]