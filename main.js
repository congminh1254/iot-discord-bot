const Discord = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');
const moment = require('moment');
const utils = require('./utils');

// ---------Discord-------------- //

const discordClient = new Discord.Client();

async function discordGetCategory(category_name) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, cache = true);
	var category = null;
	if (category_name) {
		category = guild.channels.cache.find(c => c.name.toLowerCase().trim() == category_name.toLowerCase().trim() && c.type == "category");
		if (!category) 
			throw new Error("Category channel does not exist");
	}
	return category;
}

async function discordCreateChannel(name, type='voice', category_name=null) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, cache = true);
	var category = await discordGetCategory(category_name);
	var voice_channel = null;
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && channel.name.trim().toLowerCase() == name.trim().toLowerCase() 
			&& channel.parent.name.trim().toLowerCase() == category_name.trim().toLowerCase())
			voice_channel = channel;
	});
	if (!voice_channel)
		voice_channel = await guild.channels.create(name, {
			name: name,
			type: type,
			userLimit: 5,
			parent: category ? category.id : null
		});

	var invite = await voice_channel.createInvite({
		maxAge: 60 * 60,
		maxUses: 4
	});
	return invite;
}

async function discordRemoveChannel(name, type='voice') {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, cache = true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && channel.name.trim().toLowerCase() == name.trim().toLowerCase())
			await channel.delete();
	})
}

async function discordClearChannel(name = [], type='voice', category_name=null) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, cache = true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && !name.includes(channel.name)
			&& channel.parent.name.trim().toLowerCase() == category_name.trim().toLowerCase())
			await channel.delete();
	});
}

async function discordProcessIOTTools(msg) {
	var content = msg.content;
	switch(content.split(' ')[0].trim().toLowerCase()) {
		case "/acc":
			var username = content.substr(4).trim().toLowerCase();
			console.log(username);
			var data = (await database.ref(`/private_users/`).orderByChild('lower_username').startAt(username).endAt(username).once('value')).val() || {};
			if (Object.values(data).length == 0) {
				msg.channel.send('Player not found :weary:');
			} else {
				var user = Object.values(data)[0];
				var authUser = await auth.getUser(Object.keys(data)[0]);
				var mess = new Discord.MessageEmbed()
									.setColor('#e9a327')
									.setTitle('Player Profile')
									.addFields(
										{name: 'Full name', value: user.name},
										{name: 'Roles', value: utils.Permission[user.permission], inline: true},
										{name: 'Ranking', value: utils.getRankGradeName(user.talent), inline: true},
										{name: 'Birthday', value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY')},
										{name: 'School', value: `${user.school.schoolName} - ${user.school.provinceName}`},
										{name: 'Creation time', value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss')},
										{name: 'Last sign-in time', value: moment(authUser.metadata.lastSignInTime).utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss')},
									)
									.setThumbnail(authUser.photoURL);
				var send_mess = await msg.channel.send(mess);
				Promise.all([
					send_mess.react('🔒'),
					send_mess.react('🔓'),
					send_mess.react('❌')
				]).then(async function() {
					const filter = (reaction, user) => {
						return ['🔒', '🔓', '❌'].includes(reaction.emoji.name) && user.id != send_mess.author.id;
					};
					await send_mess.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
						.then(collected => {
							const reaction = collected.first();
							switch(reaction.emoji.name) {
								case '🔒':
									send_mess.reply('Lock account!');
									break;
								case '🔓':
									send_mess.reply('Unlock account!');
									break;
								case '❌':
									send_mess.reply('Delete account!');
									break;
							}
						})
						.catch(collected => {
							send_mess.reply('You do not have any react.');
						});
					send_mess.delete();
				});

			}

			console.log(msg);
			break;
		case "/something":
			break;
	}
}

discordClient.on('ready', () => {
	console.log(`Logged in as ${discordClient.user.tag}!`);
});



discordClient.on('message', (msg) => {
	console.log(msg);
	switch (msg.channel.name.toLowerCase().trim()) {
		case 'iot-tools':
			discordProcessIOTTools(msg);
			break;
	}
	if (msg.content === 'ping') {
		msg.reply('pong');
	}
});

discordClient.login(process.env.DISCORD_BOT_KEY);

// ---------Firebase-------------- //
var config = JSON.parse(process.env.FIREBASE_CONFIG);
var cert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
config.credential = admin.credential.cert(cert);
var firebase = admin.initializeApp(config);
const database = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();


async function sendChatMessage(path, message) {
	var messId = (new Date()).getTime();
	var joMessage = {
		name: "Chatbot",
		timestamp: messId,
		permission: 100,
		text: message
	}
	await database.ref(`${path}/messages/${messId}/`).set(joMessage);
}

var refReviseRoom = database.ref('/revise/room/');
refReviseRoom.on('child_added',function(snap) {
	console.log(`New revise room: ${snap.key}`);
	discordCreateChannel(`Room ${snap.key}`, 'voice', 'Revise Channels').then(function(invite) {
		if (process.env.PUBLIC == 'true')
			sendChatMessage(`/revise/chat/${snap.key}`, `Tham gia Discord: ${invite} Kênh thoại Phòng ${snap.key}!`);
	});
});

refReviseRoom.on('child_removed', function(snap) {
	console.log(`Remove revise room: ${snap.key}`);
	discordRemoveChannel(`Room ${snap.key}`);
});

setInterval(function() {
	refReviseRoom.once('value', function(snap) {
		var data = snap.val() || {};
		var rooms = Array.from(Object.keys(data), function(key) {
			return `Room ${key}`
		});
		console.log(rooms);
		discordClearChannel(rooms, 'voice', 'Revise Channels');
	});
}, 300000);

// ------------------------------- //

var app = express();
app.use(express.json());
app.listen(process.env.PORT || 8080);

app.get('/', (req, res) => {
	res.send('Hi there, I\'m running!');
});

app.post('/fb_webhook', (req, res) => {
	console.log(`${req.method} ${req.url}\n${JSON.stringify(req.body)}`);
	res.send('Hi there, I\'m running!');
});

app.post('/discord_webhook', (req, res) => {
	console.log(`${req.method} ${req.url}\n${JSON.stringify(req.body)}`);
	res.send('Hi there, I\'m running!');
});