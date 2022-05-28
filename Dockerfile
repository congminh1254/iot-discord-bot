FROM node:16
WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD [ "npm", "start" ]

# docker stop iot-discord-bot && docker rm iot-discord-bot
#  docker build . -t iot/iot-discord-bot
#  docker run -d -it --name iot-discord-bot --restart always -p 8080:8080 --env-file /root/config/iot-discord-bot/.env iot/iot-discord-bot
