docker stop iot-discord-bot && docker rm iot-discord-bot
docker build . -t iot/iot-discord-bot
docker run -d -it --name iot-discord-bot --restart always -p 8080:8080 --env-file /root/OneDrive/config/iot-discord-bot/.env iot/iot-discord-bot
docker image prune -f