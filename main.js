const Discord = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');
var config = JSON.parse(process.env.FIREBASE_CONFIG);
var cert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
config.credential = admin.credential.cert(cert);
var firebase = admin.initializeApp(config);

const moment = require('moment');
const utils = require('./utils');
const functions = require('./functions');
// ---------Discord-------------- //

const discordClient = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });

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

async function discordDeleteUser(msg, uid) {
	var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
	var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Delete account ${user.name} (${user.username})\`\`\``);
	await Promise.all([
		confirm_msg.react('✅'),
		confirm_msg.react('❎'),
	]);
	const filter = (reaction, user) => {
		return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id;
	};
	await confirm_msg.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
		.then(collected => {
			const reaction = collected.first();
			switch(reaction.emoji.name) {
				case '✅':
					functions.accountDeleteAccount(uid).then(function(result) {
						confirm_msg.channel.send(`\`\`\`${result.message}\`\`\``);
					});
					break;
				case '❎':
					confirm_msg.channel.send('Cancel Deleted!');
					break;
			}
		})
		.catch(collected => {
			confirm_msg.channel.send('You do not have any react.');
		});
}

async function discordLockAccount(msg, uid) {
	try {
		var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
		var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Lock account ${user.name} (${user.username})\`\`\``);
		await Promise.all([
			confirm_msg.react('✅'),
			confirm_msg.react('❎'),
		]);
		const filter = (reaction, user) => {
			return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id;
		};
		var collected = await confirm_msg.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
			.catch(collected => {
				confirm_msg.channel.send('```You do not have any react.```');
				throw new Error();
			});
		const reaction = collected.first();
		console.log(reaction.id);
		switch(reaction.emoji.name) {
			case '✅':
				var days_msg = await confirm_msg.channel.send(`\`\`\`How many days?\`\`\``);
				collected = await days_msg.channel.awaitMessages((message, user) => {
					return user.id === reaction.id;
				}, {max: 1, time: 60000, errors: ['time']})
				.catch(collected => {
					throw new Error('```You do not have any message.```');
				});
				var msg_days_reply = collected.first();
				var days = parseInt(msg_days_reply.content);
				if (isNaN(days))
					throw new Error('```Number of days is not valid.```');

				var reason_msg = await confirm_msg.channel.send(`\`\`\`You'll lock this account ${days} day(s). Why?\`\`\``);
				collected = await reason_msg.channel.awaitMessages((message, user) => {
					return user.id === reaction.id;
				}, {max: 1, time: 60000, errors: ['time']})
				.catch(collected => {
					throw new Error('```You do not have any message.```');
				});
				var msg_reason_reply = collected.first();
				var reason = msg_reason_reply.content;
				await confirm_msg.channel.send(`\`\`\`You'll lock this account ${days} day(s). Reason: ${reason}.\`\`\``);

				functions.accountLockAccount(uid, days*24*60, reason).then(function(result) {
					confirm_msg.channel.send(`\`\`\`${result.message}\`\`\``);
				});
				break;
			case '❎':
				confirm_msg.channel.send(`\`\`\`Cancel Locked!\`\`\``);
				break;
		}
	}
	catch (err) {
		console.log(err);
		msg.channel.send(`Request error! ${err.message || ''}`);
	}
}

async function discordUnlockAccount(msg, uid) {
	var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
	var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Unlock account ${user.name} (${user.username})\`\`\``);
	await Promise.all([
		confirm_msg.react('✅'),
		confirm_msg.react('❎'),
	]);
	const filter = (reaction, user) => {
		return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id;
	};
	await confirm_msg.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
		.then(collected => {
			const reaction = collected.first();
			switch(reaction.emoji.name) {
				case '✅':
					functions.accountUnlockAccount(uid).then(function(result) {
						confirm_msg.channel.send(`\`\`\`${result.message}\`\`\``);
					});
					break;
				case '❎':
					confirm_msg.channel.send('Cancel Unlocked!');
					break;
			}
		})
		.catch(collected => {
			confirm_msg.channel.send('You do not have any react.');
		});
}

async function discordProcessIOTTools(msg) {
	var content = msg.content;
	switch(content.split(' ')[0].trim().toLowerCase()) {
		case "/acc":
			var username = content.substr(4).trim().toLowerCase();
			console.log(username);
			var data = (await database.ref(`/private_users/`).orderByChild('lower_username').startAt(username).endAt(username).once('value')).val();
			if (!data)
				data = (await database.ref(`/private_users/`).orderByChild('email').startAt(username).endAt(username).once('value')).val();
			data = data || {};
			if (Object.values(data).length == 0) {
				msg.channel.send('Player not found :weary:');
			} else {
				var user = Object.values(data)[0];
				var uid = Object.keys(data)[0];
				var authUser = await auth.getUser(uid);
				var isLocked = (user.block_time) ? true : false;
				var mess = new Discord.MessageEmbed()
									.setColor('#e9a327')
									.setTitle('Player Profile')
									.addFields(
										{name: 'Full name', value: user.name || null},
										{name: 'Username', value: user.username || null},
										{name: 'Email', value: user.email || null},
										{name: 'Roles', value: utils.Permission[user.permission] || null, inline: true},
										{name: 'Ranking', value: utils.getRankGradeName(user.talent) || null, inline: true},
										{name: 'Birthday', value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || null},
										{name: 'School', value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : null},
										{name: 'Creation time', value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || null},
										{name: 'Last sign-in time', value: moment(authUser.metadata.lastSignInTime).utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss')|| null},
									)
									.setThumbnail(authUser.photoURL);
				if (isLocked) {
					mess.addField('Lock until', moment(user.block_time, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss'));
					mess.addField('Lock reason', user.block_reason);
				}
				var send_mess = await msg.channel.send(mess);
				Promise.all([
					(!isLocked) ? send_mess.react('🔒') : send_mess.react('🔓'),
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
									discordLockAccount(send_mess, uid);
									break;
								case '🔓':
									discordUnlockAccount(send_mess, uid);
									break;
								case '❌':
									discordDeleteUser(send_mess, uid);
									break;
							}
						})
						.catch(collected => {
							send_mess.reply('You do not have any react.');
						});
					// send_mess.delete();
				});
			}
			console.log(msg);
			break;
		case "/something":
			break;
	}
}

async function discordProcessIOTUpdates(msg) {
	var content = msg.content;
	switch(content.split(' ')[0].trim().toLowerCase()) {
		case "/review":
			var username = content.substr(7).trim().toLowerCase();
			console.log(username);
			var data = (await database.ref(`/private_users/`).orderByChild('lower_username').startAt(username).endAt(username).once('value')).val();
			if (!data)
				data = (await database.ref(`/private_users/`).orderByChild('email').startAt(username).endAt(username).once('value')).val();
			data = data || {};
			if (Object.values(data).length == 0) {
				msg.channel.send('Player not found :weary:');
			} else {
				var user = Object.values(data)[0];
				var uid = Object.keys(data)[0];
				var authUser = await auth.getUser(uid);
				var mess = new Discord.MessageEmbed()
									.setColor('#e9a327')
									.setTitle('Player Review')
									.addFields(
										{name: 'Full name', value: user.name || null},
										{name: 'Username', value: user.username || null, inline: true},
										{name: 'Email', value: user.email || null, inline: true},
										{name: 'Birthday', value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || null},
										{name: 'School', value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : null},
										{name: 'Creation time', value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || null},
									)
									.setThumbnail(authUser.photoURL);
				var username = user.username;
				{
					var users = (await database.ref(`/private_users/`).orderByChild('name').startAt(user.name).endAt(user.name).once('value')).val() || {};
					var value = '';
					for (var user of Object.values(users))
						if (user.username != username)
							value += `${user.name} (${user.username})${(user.school) ? ' - '+ user.school.schoolName : ''} - ${utils.Permission[user.permission]}\n`;
					if (value)
						mess.addField(`Account with same name`, value);
				}
				if (user.ip) {
					var ip = user.ip.ip;
					var users = (await database.ref(`/private_users/`).orderByChild('ip/ip').startAt(ip).endAt(ip).once('value')).val() || {};
					var value = '';
					for (var user of Object.values(users))
						if (user.username != username)
							value += `${user.name} (${user.username})${(user.school) ? ' - '+ user.school.schoolName : ''} - ${utils.Permission[user.permission]}\n`;
					if (value)
						mess.addField(`Account with same IP`, value);
					var joIPData = await functions.getIPData(ip);
					mess.addField('IP', `${ip} - ${joIPData.country} - ${joIPData.as}`)
				}
				var send_mess = await msg.channel.send(mess);
				Promise.all([
					send_mess.react('✅'),
					send_mess.react('❌')
				]);
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
		case 'iot-updates': 
			discordProcessIOTUpdates(msg);
			break;
	}
	if (msg.content === 'ping') {
		msg.reply('pong');
	}
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
	if (user.id == discordClient.user.id)
		return;
	// When we receive a reaction we check if the reaction is partial or not
	if (reaction.partial) {
		// If the message this reaction belongs to was removed the fetching might result in an API error, which we need to handle
		try {
			await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message: ', error);
			// Return as `reaction.message.author` may be undefined/null
			return;
		}
	}
	// Now the message has been cached and is fully available
	console.log(`${reaction.message.author}'s message "${reaction.message.content}" gained a reaction!`);
	// The reaction is now also fully available and the properties will be reflected accurately:
	console.log(`${reaction.count} user(s) have given the same reaction to this message!`);
	console.log(reaction);
});

discordClient.login(process.env.DISCORD_BOT_KEY);

// ---------Firebase-------------- //

const database = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

functions.getIdToken();
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