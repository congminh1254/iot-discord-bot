const Discord = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');
var config = JSON.parse(process.env.FIREBASE_CONFIG);
var cert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
config.credential = admin.credential.cert(cert);
var firebase = admin.initializeApp(config);
const bot_config = require('./config');
const moment = require('moment');
const utils = require('./utils');
const functions = require('./functions');
const schedule = require('node-schedule');
const {
	Translate
} = require('@google-cloud/translate').v2;
const translate = new Translate();
const fs = require('fs');
const pdf = require('html-pdf');
const ejs = require('ejs');
fs.writeFileSync('cert.json', JSON.stringify(cert));
const fetch = require('node-fetch');

// ---------Testing-------------- //


// ---------Discord-------------- //
const discordClient = new Discord.Client({
	partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

async function discordGetCategory(category_name) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	var category = null;
	if (category_name) {
		category = guild.channels.cache.find(c => c.name.toLowerCase().trim() == category_name.toLowerCase().trim() && c.type == 'category');
		if (!category)
			throw new Error('Category channel does not exist');
	}
	return category;
}

async function discordCreateChannel(name, type = 'voice', category_name = null) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	var category = await discordGetCategory(category_name);
	var voice_channel = null;
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && channel.name.trim().toLowerCase() == name.trim().toLowerCase() &&
			channel.parent.name.trim().toLowerCase() == category_name.trim().toLowerCase())
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

async function discordRemoveChannel(name, type = 'voice') {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && channel.name.trim().toLowerCase() == name.trim().toLowerCase())
			await channel.delete();
	});
}

async function discordClearChannel(name = [], type = 'voice', category_name = null) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && !name.includes(channel.name) &&
			channel.parent.name.trim().toLowerCase() == category_name.trim().toLowerCase())
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
	await confirm_msg.awaitReactions(filter, {
		max: 1,
		time: 60000,
		errors: ['time']
	})
		.then(collected => {
			const reaction = collected.first();
			switch (reaction.emoji.name) {
			case '✅':
				functions.accountDeleteAccount(uid).then(function (result) {
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
		var collected = await confirm_msg.awaitReactions(filter, {
			max: 1,
			time: 60000,
			errors: ['time']
		})
			.catch(collected => {
				confirm_msg.channel.send('```You do not have any react.```');
				throw new Error();
			});
		const reaction = collected.first();
		console.log(reaction.id);
		switch (reaction.emoji.name) {
		case '✅':
			var days_msg = await confirm_msg.channel.send('```How many days?```');
			collected = await days_msg.channel.awaitMessages((message, user) => {
				return user.id === reaction.id;
			}, {
				max: 1,
				time: 60000,
				errors: ['time']
			})
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
			}, {
				max: 1,
				time: 60000,
				errors: ['time']
			})
				.catch(collected => {
					throw new Error('```You do not have any message.```');
				});
			var msg_reason_reply = collected.first();
			var reason = msg_reason_reply.content;
			await confirm_msg.channel.send(`\`\`\`You'll lock this account ${days} day(s). Reason: ${reason}.\`\`\``);

			functions.accountLockAccount(uid, days * 24 * 60, reason).then(function (result) {
				confirm_msg.channel.send(`\`\`\`${result.message}\`\`\``);
			});
			break;
		case '❎':
			confirm_msg.channel.send('```Cancel Locked!```');
			break;
		}
	} catch (err) {
		console.log(err);
		msg.channel.send(`Request error! ${err.message || ''}`);
	}
}

async function getIOTUidFromDiscordId(discord_id) {
	var users = (await database.ref('/private_users/').orderByChild('/discord/id').startAt(discord_id).endAt(discord_id).once('value')).val() || {};
	users = Object.keys(users);
	if (users.length > 0)
		return users[0];
	return null;
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
	await confirm_msg.awaitReactions(filter, {
		max: 1,
		time: 60000,
		errors: ['time']
	})
		.then(collected => {
			const reaction = collected.first();
			switch (reaction.emoji.name) {
			case '✅':
				functions.accountUnlockAccount(uid).then(function (result) {
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
	switch (content.split(' ')[0].trim().toLowerCase()) {
	case '/acc':
		var username = content.substr(4).trim().toLowerCase();
		var name = content.substr(7).trim();
		var data = (await database.ref('/private_users/').orderByChild('lower_username').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('email').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('name').startAt(name).endAt(name).once('value')).val();
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
				.addFields({
					name: 'Full name',
					value: user.name || null
				}, {
					name: 'Username',
					value: user.username || null
				}, {
					name: 'Email',
					value: user.email || null
				}, {
					name: 'Roles',
					value: utils.Permission[user.permission] || null,
					inline: true
				}, {
					name: 'Ranking',
					value: utils.getRankGradeName(user.talent) || null,
					inline: true
				}, {
					name: 'Birthday',
					value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || null
				}, {
					name: 'School',
					value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : null
				}, {
					name: 'Creation time',
					value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || null
				}, {
					name: 'Last sign-in time',
					value: moment(authUser.metadata.lastSignInTime).utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || null
				}, )
				.setThumbnail(authUser.photoURL);
			if (user.ip) {
				var ip = user.ip.ip;
				var users = {};
				users = (await database.ref('/private_users/').orderByChild('ip/ip').startAt(ip).endAt(ip).once('value')).val() || {};
				var value = '';
				var cnt = 0;
				for (var cur_user of Object.values(users))
					if (cur_user.name && cur_user.username != username && ++cnt <= 10)
						value += `${cur_user.name} (${cur_user.username})${(user.school) ? ' - '+ cur_user.school.schoolName : ''} - ${utils.Permission[cur_user.permission]}\n`;
				if (value)
					mess.addField('Account with same IP', value);
				var joIPData = await functions.getIPData(ip);
				mess.addField('IP', `${ip} - ${joIPData.country} - ${joIPData.as}`);
			}
			if (isLocked) {
				mess.addField('Lock until', moment(user.block_time, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss'));
				mess.addField('Lock reason', user.block_reason);
			}
			var send_mess = await msg.channel.send(mess);
			Promise.all([
				(!isLocked) ? send_mess.react('🔒') : send_mess.react('🔓'),
				send_mess.react('❌')
			]).then(async function () {
				const filter = (reaction, user) => {
					return ['🔒', '🔓', '❌'].includes(reaction.emoji.name) && user.id != send_mess.author.id;
				};
				await send_mess.awaitReactions(filter, {
					max: 1,
					time: 60000,
					errors: ['time']
				})
					.then(collected => {
						const reaction = collected.first();
						switch (reaction.emoji.name) {
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
		break;
	case '/something':
		break;
	}
}

async function discordProcessIOTUpdates(msg) {
	var content = msg.content;
	switch (content.split(' ')[0].trim().toLowerCase()) {
	case '/review':
		var username = content.substr(7).trim().toLowerCase();
		var name = content.substr(7).trim();
		var data = (await database.ref('/private_users/').orderByChild('lower_username').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('email').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('name').startAt(name).endAt(name).once('value')).val();
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
				.addFields({
					name: 'Full name',
					value: user.name || null
				}, {
					name: 'Username',
					value: user.username || null,
					inline: true
				}, {
					name: 'Email',
					value: user.email || null,
					inline: true
				}, {
					name: 'Birthday',
					value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || null
				}, {
					name: 'School',
					value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : null
				}, {
					name: 'Creation time',
					value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || null
				}, )
				.setThumbnail(authUser.photoURL)
				.setFooter(uid);
			username = user.username;
			if (username) {
				var users = (await database.ref('/private_users/').orderByChild('name').startAt(user.name).endAt(user.name).once('value')).val() || {};
				var value = '';
				var cnt = 0;
				for (var cur_user of Object.values(users))
					if (cur_user.name && cur_user.username != username && ++cnt <= 10)
						value += `${cur_user.name} (${cur_user.username})${(cur_user.school) ? ' - '+ cur_user.school.schoolName : ''} - ${utils.Permission[cur_user.permission]}\n`;
				if (value)
					mess.addField('Account with same name', value);
			}
			if (user.ip) {
				var ip = user.ip.ip;
				users = {};
				users = (await database.ref('/private_users/').orderByChild('ip/ip').startAt(ip).endAt(ip).once('value')).val() || {};
				value = '';
				cnt = 0;
				for (cur_user of Object.values(users))
					if (cur_user.name && cur_user.username != username && ++cnt <= 10)
						value += `${cur_user.name} (${cur_user.username})${(user.school) ? ' - '+ cur_user.school.schoolName : ''} - ${utils.Permission[cur_user.permission]}\n`;
				if (value)
					mess.addField('Account with same IP', value);
				var joIPData = await functions.getIPData(ip);
				mess.addField('IP', `${ip} - ${joIPData.country} - ${joIPData.as}`);
			}
			if (msg.author.bot) {
				var members = msg.guild.roles.cache.find(r => r.name === 'admin').members;
				var keys = Array.from(members.keys());
				await msg.channel.send(`<@${keys[Math.floor(Math.random() * keys.length)]}>`);
			} else
				await msg.channel.send(`<@${msg.author.id}>`);
			var send_mess = await msg.channel.send(mess);
			Promise.all([
				send_mess.react('✅'),
				send_mess.react('❌')
			]);
		}
		break;
	case '/something':
		break;
	}
}

async function discordProcessBotLogs(msg) {
	var content = msg.content;
	switch (content.split(' ')[0].trim().toLowerCase()) {
	case '/link':
		var uid = msg.content.split(' ')[2];
		var member = msg.guild.members.cache.find(r => r.id === uid);
		if (member) {
			linkIOTAccount(member, true);
			msg.delete();
		}
		break;
	case '/unlink':
		var uid = msg.content.split(' ')[2];
		var member = msg.guild.members.cache.find(r => r.id === uid);
		if (member) {
			linkIOTAccount(member, false);
			msg.delete();
		}
		break;
	case '/relink':
		var uid = msg.content.split(' ')[2];
		var member = msg.guild.members.cache.find(r => r.id === uid);
		if (member) {
			linkIOTAccount(member, false);
			msg.delete();
		}
		break;
	case '/relink-all':
		msg.guild.members.cache.forEach(async function (member) {
			if (!member.bot)
				linkIOTAccount(member, false);
		});
		break;
	case '/something':
		break;
	}
}

async function discordProcessMessage(msg) {
	var content = msg.content;
	if (Math.round(Math.random()*100) == 99) {
		msg.react('807344101283332097');
	}
	switch (content.split(' ')[0].trim().toLowerCase()) {
	case '/iot':
		msg.react('👌');
		if (msg.mentions.users.size < 1) {
			var id = msg.author.id;
			var uid = await getIOTUidFromDiscordId(id);
			var buffer = await generateIOTProfile(uid);
			msg.channel.send({
				files: [buffer]
			});
		} else {
			for (var user of msg.mentions.users.values()) {
				console.log(user);
				var id = user.id;
				var uid = await getIOTUidFromDiscordId(id);
				var buffer = await generateIOTProfile(uid);
				msg.channel.send({
					files: [buffer]
				});
			}
		}
		break;
	case '/help':
		break;
	case '/help-done':
		break;
	}
	// --- Check Regex ---
	var regexp_emoji = /^:[^\s:\\\/]+?:$/;
	if (regexp_emoji.test(content))
		discordSendEmoji(msg);
}

async function discordProcessInteraction(interaction) {
	switch (interaction.data.name.toLowerCase()) {
	case 'iot':
		var id = interaction.member.user.id;
		if (interaction.data.options)
			id = interaction.data.options[0].value;
		var uid = await getIOTUidFromDiscordId(id);
		var buffer = await generateIOTProfile(uid);
		console.log(interaction.id, interaction.token);
		discordClient.api.interactions(interaction.id, interaction.token).callback.post({
			data: {
				type: 4,
				data: {
					content: 'hello world!',
					flag: 64,
					// embeds: [{
					// 	image: buffer
					// }]
				}
			}
		});
	}
}


// --- Emoji --- 
var data_emoji = null;
async function discordSendEmoji(msg) {
	if (!data_emoji) {
		data_emoji = await (await fetch('https://emoji.gg/api/')).json();
		data_emoji = data_emoji.reduce(function (result, item, index, array) {
			result[item.title] = item; //a, b, c
			return result;
		}, {});
	}
	var name = msg.content.replace(/:/g, '');
	if (data_emoji[name])
		msg.channel.send(data_emoji[name].image);
}

async function linkIOTAccount(member, welcome_message = true) {
	await member.roles.remove(member.roles.cache);
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == 'general');
	var uid = member.id;
	var users = (await database.ref('/private_users/').orderByChild('/discord/id').startAt(uid).endAt(uid).once('value')).val() || {};
	users = Object.values(users);
	if (users.length > 0) {
		var user = users[0];
		switch (user.permission) {
		case 10:
			await member.roles.add(member.guild.roles.cache.find(r => r.name === 'admin'));
			break;
		case 5:
			await member.roles.add(member.guild.roles.cache.find(r => r.name === 'moderator'));
			break;
		case 2:
			await member.roles.add(member.guild.roles.cache.find(r => r.name === 'verified-player'));
			break;
		}
		if (user.talent)
			switch (user.talent.rank) {
			case 0:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-rookie'));
				break;
			case 1:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-bronze'));
				break;
			case 2:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-silver'));
				break;
			case 3:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-gold'));
				break;
			case 4:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-platinum'));
				break;
			case 5:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-diamond'));
				break;
			case 6:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-crown'));
				break;
			case 7:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'rank-ace'));
				break;
			}
		if (welcome_message)
			channel.send(`Chào mừng người chơi IOT ${user.username} (${utils.getRankGradeName(user.talent)}) tham gia server ${member} :heart_eyes_cat:`);
	}
}


function generateIOTProfile(uid) {
	return new Promise(async function (resolve, reject) {
		var html = fs.readFileSync('./templates/msg-rank.html', 'utf8');
		var params = {};
		var public_user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
		var tours = (await database.ref('/tournaments/').once('value')).val();
		var label_permission = '';
		var banned = '';
		for (var tour of Object.values(tours))
			if (tour.tourModerator.includes(uid))
				label_permission += `<img class="icon-logo" src="${tour.tourLogo}"></img>`;
		if (label_permission.length < 5)
			label_permission = utils.Permission[public_user.permission];
		if (public_user.permission < 1 || public_user.block_time)
			banned = 'banned';
		if (public_user.name.length > 20) {
			var names = public_user.name.trim().split(' ');
			public_user.name = `${names[names.length -2]} ${names[names.length - 1]}`;
		}
		params['user'] = {
			'avatar': public_user.avatarUrl || 'https://iot.chinhphucvn.com/img/user-avatar.png',
			'rank_name': utils.getRankGradeName(public_user.talent),
			'rank_class': utils.getRankClass(public_user.talent),
			'rank_point': public_user.talent.point,
			'name': public_user.name,
			'username': public_user.username,
			'school': `${public_user.school.schoolName} - ${public_user.school.provinceName}`,
			'account_time': null,
			'account_time_unit': null,
			'permission_name': utils.Permission[public_user.permission],
			'permission': public_user.permission,
			'list_tournaments': label_permission,
			'banned': banned
		};
		var created_time = public_user.created_at || Math.floor((new Date()) / 1000);
		var years = (new moment()).diff(moment.unix(created_time), 'years');
		var months = (new moment()).diff(moment.unix(created_time), 'months');
		var days = (new moment()).diff(moment.unix(created_time), 'days');
		if (years) {
			params.user['account_time'] = years;
			params.user['account_time_unit'] = 'Năm';
		} else if (months) {
			params.user['account_time'] = months;
			params.user['account_time_unit'] = 'Tháng';
		} else {
			params.user['account_time'] = days;
			params.user['account_time_unit'] = 'Ngày';
		}

		html = ejs.render(html, params);
		var options = {
			'zoomFactor': '2',
			'type': 'png'
		};

		pdf.create(html, options).toBuffer(function (err, buffer) {
			resolve(buffer);
		});
	});
}

discordClient.on('ready', () => {
	console.log(`Logged in as ${discordClient.user.tag}!`);
	discordClient.user.setActivity('IOT - IMIN Olympia Training', {
		type: 'PLAYING',
		url: 'https://iot.chinhphucvn.com'
	});
});

discordClient.on('message', async function (msg) {
	console.log(msg);
	discordProcessMessage(msg);
	switch (msg.channel.name.toLowerCase().trim()) {
	case 'iot-tools':
		discordProcessIOTTools(msg);
		break;
	case 'iot-updates':
		discordProcessIOTUpdates(msg);
		break;
	case 'bot-logs':
		discordProcessBotLogs(msg);
		break;
	}

	if (msg.content === 'ping') {
		msg.reply('pong');
	}
	if (!msg.author.bot && (msg.content.toLowerCase().indexOf('baymax') > -1 || msg.content.indexOf(`<@!${discordClient.user.id}>`) > -1)) {
		var msg_text = bot_config.GREETING_MSG[Math.floor(Math.random() * bot_config.GREETING_MSG.length)];
		var lang = bot_config.GREETING_LANGUAGES[Math.floor(Math.random() * bot_config.GREETING_LANGUAGES.length)];
		// Translates some text into Russian
		const [translation] = await translate.translate(msg_text, lang);
		msg.reply(translation);
	}
});

discordClient.ws.on('INTERACTION_CREATE', async interaction => {
	// console.log(interaction);
	// discordClient.api.interactions(interaction.id, interaction.token).callback.post({data: {
	// 	type: 5,
	// 	data: {

	// 	}
	// }});
	discordProcessInteraction(interaction);
});

discordClient.on('messageReactionAdd', async (reaction, user) => {
	if (user.id == discordClient.user.id)
		return;
	// When we receive a reaction we check if the reaction is partial or not
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message: ', error);
			return;
		}
	}
	if (reaction.message.embeds.length > 0) {
		var embed = reaction.message.embeds[0];
		console.log(embed.title);
		switch (embed.title.toLowerCase()) {
		case 'player review':
			if (reaction.emoji.name == '✅')
				functions.accountApproveAccount(embed.footer.text).then(function (result) {
					reaction.message.channel.send(`\`\`\`${result.message}\`\`\``);
					reaction.message.delete();
				});
			else if (reaction.emoji.name == '❌')
				functions.accountRejectAccount(embed.footer.text).then(function (result) {
					reaction.message.channel.send(`\`\`\`${result.message}\`\`\``);
					reaction.message.delete();
				});
			break;
		}
	}
});

discordClient.on('guildMemberAdd', async function (member) {
	linkIOTAccount(member, true);
});


var scheduleReview = schedule.scheduleJob('0 */6 * * *', function () {
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == 'iot-updates');
	channel.messages.fetch().then(messages => {
		messages.array().forEach(msg => {
			msg.delete();
		});
	});

	setTimeout(async function () {
		channel.send('```Check Again!!!```');
		var accounts = (await functions.accountGetAccountReview()).data;
		if (accounts.length > 0) {
			channel.send(`\`\`\`There are ${accounts.length} remaining accounts to be reviewed!\`\`\``);
			for (var user of accounts) {
				await channel.send(`/review ${user.email}`);
				await new Promise((resolve) => {
					setTimeout(resolve(), 30000);
				});
			}
		}
	}, 15000);
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
		name: 'Chatbot',
		timestamp: messId,
		permission: 100,
		text: message
	};
	await database.ref(`${path}/messages/${messId}/`).set(joMessage);
}

var refReviseRoom = database.ref('/revise/room/');
refReviseRoom.on('child_added', function (snap) {
	discordCreateChannel(`Room ${snap.key}`, 'voice', 'Revise Channels').then(function (invite) {
		if (process.env.PUBLIC == 'true')
			sendChatMessage(`/revise/chat/${snap.key}`, `Tham gia Discord: ${invite} Kênh thoại Phòng ${snap.key}!`);
	});
});

refReviseRoom.on('child_removed', function (snap) {
	discordRemoveChannel(`Room ${snap.key}`);
});

setInterval(function () {
	refReviseRoom.once('value', function (snap) {
		var data = snap.val() || {};
		var rooms = Array.from(Object.keys(data), function (key) {
			return `Room ${key}`;
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
	console.log(req);
	res.send();
});

app.post('/discord_webhook', (req, res) => {
	console.log(`${req.method} ${req.url}\n${JSON.stringify(req.body)}`);
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify({
		'status': 1,
		'message': 'success'
	}));
});

app.post('/fb_webhook', (req, res) => {
	console.log(`${req.method} ${req.url}\n${JSON.stringify(req.body)}`);
	res.send('Hi there, I\'m running!');
});

setInterval(async function () {
	await fetch(process.env.HOMEPAGE || 'https://www.chinhphucvn.com');
}, 60000);