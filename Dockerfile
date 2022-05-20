FROM node:17
WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD [ "npm", "start" ]

# docker stop iot-discord-bot && docker rm iot-discord-bot
#  docker build . -t iot/iot-discord-bot
#  docker run -d -it --name iot-discord-bot --restart always --net=host -p 8080:8080 --mount type=bind,source=/root/config/iot-discord-bot/cert.json,target=/config/cert.json --env-file /root/config/iot-discord-bot/.env iot/iot-discord-bot
