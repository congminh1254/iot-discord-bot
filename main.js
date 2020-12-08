const Discord = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');

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

discordClient.on('ready', () => {
	console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.on('message', (msg) => {
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