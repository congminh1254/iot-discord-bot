const Discord = require('discord.js');
const http = require('http');

const discordClient = new Discord.Client();


discordClient.on('ready', () => {
	console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.on('message', (msg) => {
	if (msg.content === 'ping') {
		msg.reply('pong');
	}
});

discordClient.login(process.env.DISCORD_BOT_KEY);


http.createServer(function (req, res) {
	res.write('Hi there, I\'m running!');
	res.end();
}).listen(80);