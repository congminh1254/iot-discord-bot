const { MessageEmbed, Client, Intents, MessageActionRow, MessageButton } = require('discord.js');
const express = require('express');
var cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const pdf = require('html-pdf');
const ejs = require('ejs');
var config = JSON.parse((new Buffer(process.env.FIREBASE_CONFIG, 'base64')).toString('ascii'));
var cert = JSON.parse((new Buffer(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64')).toString('ascii'));
fs.writeFileSync('./cert.json', JSON.stringify(cert));
config.credential = admin.credential.cert('./cert.json');
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


const fetch = require('node-fetch');

// ---------Testing-------------- //


// ---------Discord-------------- //
// const discordClient = new Discord.Client({
// 	partials: ['MESSAGE', 'CHANNEL', 'REACTION']
// });

const discordClient = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS], partials: ['MESSAGE', 'CHANNEL', 'REACTION'], });

async function discordGetCategory(category_name) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	var category = null;
	if (category_name) {
		category = guild.channels.cache.find(c => c.name.toLowerCase().trim() == category_name.toLowerCase().trim() && c.type == 'GUILD_CATEGORY');
		if (!category)
			throw new Error(`Category channel ${category_name} does not exist`);
	}
	return category;
}

async function discordCreateChannel(name, type = 'GUILD_VOICE', category_name = null) {
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

async function discordRemoveChannel(name, type = 'GUILD_VOICE') {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && channel.name.trim().toLowerCase() == name.trim().toLowerCase())
			await channel.delete();
	});
}

async function discordClearChannel(name = [], type = 'GUILD_VOICE', category_name = null) {
	var guild = await discordClient.guilds.fetch(process.env.DISCORD_GUILD_ID, true);
	await guild.channels.cache.forEach(async function (channel) {
		if (channel.type == type && !name.includes(channel.name) &&
			channel.parent.name.trim().toLowerCase() == category_name.trim().toLowerCase())
			await channel.delete();
	});
}

async function discordDeleteUser(interaction, uid) {
	try {
		var msg = interaction.message;
		msg.delete();
		var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
		var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Delete account ${user.name} (${user.username})\`\`\``);
		await Promise.all([
			confirm_msg.react('✅'),
			confirm_msg.react('❎'),
		]);
		const filter = (reaction, user) => {
			return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id;
		};
		await confirm_msg.awaitReactions({filter,
			max: 1,
			time: 60000,
			errors: ['time']
		}).then(collected => {
			const reaction = collected.first();
			switch (reaction.emoji.name) {
			case '✅':
				functions.accountDeleteAccount(uid).then(function (result) {
					interaction.editReply(`\`\`\`${result.message.message}\`\`\``);
				});
				break;
			case '❎':
				interaction.editReply('Cancel Deleted!');
				break;
			}
		})
			.catch(() => {
				throw new Error('You do not have any react.');
			});
		confirm_msg.delete();
	} catch (err) {
		await interaction.editReply(`Request error! ${err.message || ''}`);
	}
}

async function discordLockAccount(interaction, uid) {
	try {
		var msg = interaction.message;
		msg.delete();
		var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
		var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Lock account ${user.name} (${user.username})\`\`\``);
		await Promise.all([
			confirm_msg.react('✅'),
			confirm_msg.react('❎'),
		]);
		const filter = (reaction, user) => {
			return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id && user.id === interaction.user.id;
		};
		var collected = await confirm_msg.awaitReactions({filter,
			max: 1,
			time: 60000,
			errors: ['time']
		}).catch(() => {
			throw new Error('```You do not have any react.```');
		});
		confirm_msg.delete();
		const reaction = collected.first();
		const filter2 = m => m.author.id.equals(interaction.user.id);
		switch (reaction.emoji.name) {
		case '✅':
			var days_msg = await confirm_msg.channel.send('```How many days?```');
			collected = await days_msg.channel.awaitMessages({filter2,
				max: 1,
				time: 60000,
				errors: ['time']
			}).catch(() => {
				throw new Error('```You do not have any message.```');
			});
			days_msg.delete();
			var msg_days_reply = collected.first();
			var days = parseInt(msg_days_reply.content);
			msg_days_reply.delete();
			if (isNaN(days))
				throw new Error('```Number of days is not valid.```');
			var reason_msg = await confirm_msg.channel.send(`\`\`\`You'll lock this account ${days} day(s). Why?\`\`\``);
			collected = await reason_msg.channel.awaitMessages({filter2,
				max: 1,
				time: 60000,
				errors: ['time']
			}).catch(() => {
				throw new Error('```You do not have any message.```');
			});
			reason_msg.delete();
			var msg_reason_reply = collected.first();
			var reason = msg_reason_reply.content;
			msg_reason_reply.delete();
			var noti_msg = await confirm_msg.channel.send(`\`\`\`You'll lock this account ${days} day(s). Reason: ${reason}.\`\`\``);
			functions.accountLockAccount(uid, days * 24 * 60, reason).then(function (result) {
				interaction.editReply(`\`\`\`${result.message.message}\`\`\``);
				noti_msg.delete();
			});
			break;
		case '❎':
			interaction.editReply('```Cancel Locked!```');
			break;
		}
	} catch (err) {
		await interaction.editReply(`Request error! ${err.message || ''}`);
	}
}

async function getIOTUidFromDiscordId(discord_id) {
	var users = (await database.ref('/private_users/').orderByChild('/discord/id').startAt(discord_id).endAt(discord_id).once('value')).val() || {};
	users = Object.keys(users);
	if (users.length > 0)
		return users[0];
	return null;
}

async function discordUnlockAccount(interaction, uid) {
	try {
		var msg = interaction.message;
		msg.delete();
		var user = (await database.ref(`/private_users/${uid}/`).once('value')).val();
		var confirm_msg = await msg.channel.send(`\`\`\`Are you sure? Unlock account ${user.name} (${user.username})\`\`\``);
		await Promise.all([
			confirm_msg.react('✅'),
			confirm_msg.react('❎'),
		]);
		const filter = (reaction, user) => {
			return ['✅', '❎'].includes(reaction.emoji.name) && user.id != confirm_msg.author.id;
		};
		await confirm_msg.awaitReactions({filter,
			max: 1,
			time: 60000,
			errors: ['time']
		}).then(collected => {
			const reaction = collected.first();
			switch (reaction.emoji.name) {
			case '✅':
				functions.accountUnlockAccount(uid).then(function (result) {
					interaction.editReply(`\`\`\`${result.message.message}\`\`\``);
				});
				break;
			case '❎':
				interaction.editReplys('```Cancel Unlocked!```');
				break;
			}
		}).catch(() => {
			throw new Error('You do not have any react.');
		});
		confirm_msg.delete();
	} catch (err) {
		await interaction.editReply(`Request error! ${err.message || ''}`);
	}
}

async function discordProcessIOTTools(msg) {
	var content = msg.content;
	switch (content.split(' ')[0].trim().toLowerCase()) {
	case '/acc':
		var username = content.substr(4).trim().toLowerCase();
		var name = content.substr(4).trim();
		var data = (await database.ref('/private_users/').orderByChild('lower_username').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('email').startAt(username).endAt(username).once('value')).val();
		if (!data)
			data = (await database.ref('/private_users/').orderByChild('name').startAt(name).endAt(name).once('value')).val();
		if (!data) {
			try {
				var authUser = await auth.getUserByEmail(username);
				if (authUser)
				{
					var uid = authUser.uid;
					var profile = (await database.ref(`/private_users/${uid}/`).once('value')).val();
					data = {};
					data[uid] = profile;
				}
			} catch (err) {
				console.log(err);
			}
		}
		data = data || {};
		if (Object.values(data).length == 0) {
			msg.channel.send('Player not found :weary:');
		} else {
			var user = Object.values(data)[0];
			var uid = Object.keys(data)[0];
			var authUser = await auth.getUser(uid);
			var isLocked = (user.block_time) ? true : false;
			var mess = new MessageEmbed()
				.setColor('#e9a327')
				.setTitle('Player Profile')
				.addFields({
					name: 'Full name',
					value: user.name || 'null'
				}, {
					name: 'Username',
					value: user.username || 'null'
				}, {
					name: 'Email',
					value: user.email || 'null'
				}, {
					name: 'Roles',
					value: utils.Permission[user.permission] || 'null',
					inline: true
				}, {
					name: 'Ranking',
					value: utils.getRankGradeName(user.talent) || 'null',
					inline: true
				}, {
					name: 'Birthday',
					value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || 'null'
				}, {
					name: 'School',
					value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : 'null'
				}, {
					name: 'Creation time',
					value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || 'null'
				}, {
					name: 'Last sign-in time',
					value: moment(authUser.metadata.lastSignInTime).utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || 'null'
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
			const row = new MessageActionRow();
			if (!isLocked)
				row.addComponents(new MessageButton().setCustomId(`lock_${uid}`).setStyle('PRIMARY').setLabel('Khóa'));
			else
				row.addComponents(new MessageButton().setCustomId(`unlock_${uid}`).setStyle('PRIMARY').setLabel('Mở khóa'));
			row.addComponents(new MessageButton().setCustomId(`delete_${uid}`).setStyle('DANGER').setLabel('Xóa'));
			await msg.channel.send({
				embeds: [mess],
				components: [row]
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
		if (!data) {
			try {
				var authUser = await auth.getUserByEmail(username);
				if (authUser)
				{
					var uid = authUser.uid;
					var profile = (await database.ref(`/private_users/${uid}/`).once('value')).val();
					data = {};
					data[uid] = profile;
				}
			}
			catch (ex) {
				console.log(ex);
			}
		}
		data = data || {};
		if (Object.values(data).length == 0) {
			msg.channel.send('Player not found :weary:');
		} else {
			var user = Object.values(data)[0];
			var uid = Object.keys(data)[0];
			var authUser = await auth.getUser(uid);
			var mess = new MessageEmbed()
				.setColor('#e9a327')
				.setTitle('Player Review')
				.addFields({
					name: 'Full name',
					value: user.name || ' - '
				}, {
					name: 'Username',
					value: user.username || ' - ',
					inline: true
				}, {
					name: 'Email',
					value: user.email || ' - ',
					inline: true
				}, {
					name: 'Birthday',
					value: moment(user.birthday, 'X').utcOffset('+0700').format('DD/MM/YYYY') || ' - '
				}, {
					name: 'School',
					value: (user.school) ? `${user.school.schoolName} - ${user.school.provinceName}` : ' - '
				}, {
					name: 'Creation time',
					value: moment(user.created_at, 'X').utcOffset('+0700').format('DD/MM/YYYY HH:mm:ss') || ' - '
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
				// var members = msg.guild.roles.cache.find(r => r.name === 'admin').members;
				// var keys = Array.from(members.keys());
				// await msg.channel.send(`<@${keys[Math.floor(Math.random() * keys.length)]}>`);
				await msg.channel.send('@here');
			} else
				await msg.channel.send(`<@${msg.author.id}>`);
			const row = new MessageActionRow().addComponents(
				new MessageButton()
					.setCustomId(`approve_${uid}`)
					.setLabel('Chấp nhận')
					.setStyle('PRIMARY'),
			).addComponents(
				new MessageButton()
					.setCustomId(`reject_${uid}`)
					.setLabel('Từ chối')
					.setStyle('DANGER'),
			);
			await msg.channel.send({
				'embeds': [mess],
				'components': [row]
			});
		}
		break;
	case '/review-all':
		sendAllWaitingAccount();
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
		}
		msg.delete();
		break;
	case '/unlink':
		var uid = msg.content.split(' ')[2];
		var member = msg.guild.members.cache.find(r => r.id === uid);
		if (member) {
			linkIOTAccount(member, false);
		}
		msg.delete();
		break;
	case '/relink':
		var uid = msg.content.split(' ')[2];
		var member = msg.guild.members.cache.find(r => r.id === uid);
		if (member) {
			linkIOTAccount(member, false);
		}
		msg.delete();
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
		// msg.react('');
	}
	// --- Check Regex ---
	var regexp_emoji = /^:[^\s:\\\/]+?:$/;
	if (regexp_emoji.test(content))
		discordSendEmoji(msg);
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
	await member.roles.remove(member.roles.cache).catch((err) => {
		console.log(err);
	});
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

		if (user.plan && user.plan > 0)
			switch (user.plan) {
			case 1:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'elite'));
				break;
			case 2:
				await member.roles.add(member.guild.roles.cache.find(r => r.name === 'elite+'));
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
			if (tour.tourModecrator.includes(uid))
				label_permission += `<img class="icon-logo" src="${tour.tourLogo}"></img>`;
		if (label_permission.length < 5)
			label_permission = utils.Permission[public_user.permission];
		if (public_user.permission < 1 || public_user.block_time)
			banned = 'banned';
		if (public_user.name.length > 15) {
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
			'type': 'png',
			localUrlAccess: true
		};

		pdf.create(html, options).toBuffer(function (err, buffer) {
			if (err)
				console.error(err);
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

discordClient.on('messageCreate', async function (msg) {
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

	if (!msg.author.bot && (msg.content.toLowerCase().indexOf('baymax') > -1 || msg.content.indexOf(`<@!${discordClient.user.id}>`) > -1)) {
		var msg_text = bot_config.GREETING_MSG[Math.floor(Math.random() * bot_config.GREETING_MSG.length)];
		var lang = bot_config.GREETING_LANGUAGES[Math.floor(Math.random() * bot_config.GREETING_LANGUAGES.length)];
		// Translates some text into Russian
		const [translation] = await translate.translate(msg_text, lang);
		msg.reply(translation);
	}
});

discordClient.on('interactionCreate', async interaction => {
	if (interaction.isCommand()) {

		const { commandName } = interaction;

		if (commandName === 'ping') {
			await interaction.reply('Pong!');
		} else if (commandName === 'server') {
			await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
		} else if (commandName === 'user') {
			await interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
		} else if (commandName === 'iot') {
			// console.log(interaction);
			await interaction.deferReply();
			var user = interaction.options.getMember('user');
			var id = null;
			if (!user)
				id = interaction.user.id;
			else
				id = user.id;
			var uid = await getIOTUidFromDiscordId(id);
			if (!uid)
				return interaction.editReply('User not found!');
			var buffer = await generateIOTProfile(uid);
			await interaction.editReply({
				files: [buffer]
			});
		} else if (commandName === 'support') {
			await interaction.deferReply();
			var caseId = Math.floor(Math.random() * 1000000);
			await discordCreateChannel(`case_${caseId}`, 'GUILD_TEXT', 'help channels');
			var channel = interaction.guild.channels.cache.find(r => r.name === `case_${caseId}`);
			await channel.permissionOverwrites.edit(interaction.user, {
				'VIEW_CHANNEL': true,
				'SEND_MESSAGES': true
			});
			// send inital message for support to channel
			var mess = new MessageEmbed()
				.setColor('#0099ff')
				.setTitle(`Support Request - Case ${caseId}`)
				.setDescription(`${interaction.user} gửi yêu cầu hỗ trợ, vui lòng đợi quản trị viên trả lời.`)
				.setTimestamp();
			mess.addField('Tham gia', `<@${interaction.user.id}> @here`);
			mess.addField('Hướng dẫn', 'Bạn hãy giải thích vấn đề gặp phải và chờ quản trị viên giải quyết nhé.\nSau khi kết thúc, gõ /done để xóa kênh.');
			await channel.send({embeds: [mess]});
			await channel.send(`<@${interaction.user.id}>`);
			const userId = interaction.user.id;
			const user = interaction.guild.members.cache.find(r => r.id === userId);
			if (user.roles.cache.find(r => r.name === 'admin') || user.roles.cache.find(r => r.name === 'moderator') || user.roles.cache.find(r => r.name === 'verified-player')) {
				uid = await getIOTUidFromDiscordId(userId);
				if (!uid)
					return channel.send('User not found!');
				else {
					buffer = await generateIOTProfile(uid);
					await channel.send({
						files: [buffer]
					});
				}
			}
			await interaction.editReply(`Vui lòng gửi tin nhắn vào kênh <#${channel.id}> để giải quyết vấn đề.`);
		} else if (commandName === 'done') {
			if (interaction.channel.name.startsWith('case_')) {
				await interaction.reply('Vui lòng đợi!');
				await discordRemoveChannel(interaction.channel.name, 'GUILD_TEXT');
			} else {
				interaction.reply('Kênh không hợp lệ!');
			}
		} else if (commandName === 'update-role') {
			await interaction.deferReply();
			var member = interaction.guild.members.cache.find(r => r.id === interaction.user.id);
			uid = await getIOTUidFromDiscordId(member.id);
			if (!uid)
				interaction.editReply('Tài khoản chưa liên kết với IOT!');
			else {
				linkIOTAccount(member, false);
				interaction.editReply('Cập nhật thành công!');
			}
		}
	} else if (interaction.isButton()) {
		var action = interaction.customId.split('_')[0];
		var params = interaction.customId.split('_');
		switch (action) {
		case 'approve':
			await interaction.deferReply();
			await functions.accountApproveAccount(params[1]).then(async function (result) {
				await interaction.editReply(`\`\`\`${result.message}\`\`\``);
				await interaction.message.delete();
			});
			break;
		case 'reject':
			await interaction.deferReply();
			await functions.accountRejectAccount(params[1]).then(async function (result) {
				await interaction.editReply(`\`\`\`${result.message}\`\`\``);
				await interaction.message.delete();
			});
			break;
		case 'lock':
			await interaction.deferReply();
			await discordLockAccount(interaction, params[1]);
			break;
		case 'unlock':
			await interaction.deferReply();
			await discordUnlockAccount(interaction, params[1]);
			break;
		case 'delete':
			await interaction.deferReply();
			await discordDeleteUser(interaction, params[1]);
			break;
		case 'reportignore':
			await interaction.deferReply();
			var userId = interaction.user.id;
			user = interaction.guild.members.cache.find(r => r.id === userId);
			var embed = interaction.message.embeds[0];
			var options = Array.from(embed.fields.map(r => r.name));
			var row = interaction.message.components[0];
			var voted = [];
			if (params[2])
				voted = params[2].split(',');
			var voted_users = [];
			var voted_name = '';
			for (i = 0; i < embed.fields.length; i++) {
				if (embed.fields[i].name === 'Biểu quyết') {
					voted_users = embed.fields[i].value.trim().split(' ');
				}
			}
			if (voted_users.includes(`<@${userId}>`)) {
				return await interaction.deleteReply();
			}
			voted_users = voted_users.filter(r => r.trim() !== '');
			if (user.roles.cache.find(r => r.name === 'admin') || user.roles.cache.find(r => r.name === 'moderator') || user.roles.cache.find(r => r.name === 'verified-player')) {
				for (var i = 0; i < row.components.length; i++) {
					if (row.components[i].customId.startsWith('reportignore_')) {
						if (params.length <= 2)
							row.components[i].customId +=  `_${voted.length}`;
						else
							row.components[i].customId +=  `,${voted.length}`;
						row.components[i].label = row.components[i].label.split('(')[0].trim();
						voted_name = row.components[i].label;
						row.components[i].label += ` (${voted.length + 1} phiếu)`;
						voted = row.components[i].customId.split('_')[2].split(',');
					}
				}
				if (!options.includes('Biểu quyết'))
					embed.fields.push({
						name: 'Biểu quyết', value: ''
					});
				for (i = 0; i < embed.fields.length; i++) {
					if (embed.fields[i].name === 'Biểu quyết') {
						embed.fields[i].value +=  ` <@${userId}>`;
						voted_users.push(`<@${userId}>`);
					}
				}
				await interaction.message.edit({embeds: [embed], components: [row], attachments: []});
				interaction.editReply(`<@${userId}> biểu quyết ${voted_name}`);
			} else {
				return interaction.editReply('Bạn không có quyền thực hiện thao tác này!');
			}
			if (voted.length >= 5 || user.roles.cache.find(r => r.name === 'admin')) {
				var voted_msg = '';
				for (i = 0; i < voted.length; i++) {
					voted_msg += `${voted_users[voted[i]]} `;
				}
				embed.addField('Quyết định', voted_msg);
				for (i = 0; i < row.components.length; i++) {
					row.components[i].disabled = true;
				}
				for (i = 0; i<embed.fields.length; i++) {
					if (embed.fields[i].name === 'Biểu quyết') {
						embed.fields.splice(i, 1);
					}
				}
				embed.addField('Trạng thái', 'Báo cáo được bỏ qua.');
				await interaction.message.edit({embeds: [embed], components: [row], attachments: []});
			}
			break;
		case 'reportblock':
			await interaction.deferReply();
			userId = interaction.user.id;
			user = interaction.guild.members.cache.find(r => r.id === userId);

			embed = interaction.message.embeds[0];
			options = Array.from(embed.fields.map(r => r.name));
			row = interaction.message.components[0];
			voted = [];
			if (params[3])
				voted = params[3].split(',');
			voted_users = [];
			for (i = 0; i < embed.fields.length; i++) {
				if (embed.fields[i].name === 'Biểu quyết') {
					voted_users = embed.fields[i].value.trim().split(' ');
				}
			}
			if (voted_users.includes(`<@${userId}>`)) {
				return await interaction.deleteReply();
			}
			voted_users = voted_users.filter(r => r.trim() !== '');
			var voted_name = '';
			if (user.roles.cache.find(r => r.name === 'admin') || user.roles.cache.find(r => r.name === 'moderator') || user.roles.cache.find(r => r.name === 'verified-player')) {
				for (i = 0; i < row.components.length; i++) {
					if (row.components[i].customId.startsWith('reportblock_')) {
						if (params.length <= 3)
							row.components[i].customId +=  `_${voted.length}`;
						else
							row.components[i].customId +=  `,${voted.length}`;
						row.components[i].label = row.components[i].label.split('(')[0].trim();
						voted_name = row.components[i].label;
						row.components[i].label += ` (${voted.length + 1} phiếu)`;
						voted = row.components[i].customId.split('_')[3].split(',');
					}
				}
				if (!options.includes('Biểu quyết'))
					embed.fields.push({
						name: 'Biểu quyết', value: ''
					});
				for (i = 0; i < embed.fields.length; i++) {
					if (embed.fields[i].name === 'Biểu quyết') {
						embed.fields[i].value +=  ` <@${userId}>`;
						voted_users.push(`<@${userId}>`);
					}
				}
				await interaction.message.edit({embeds: [embed], components: [row]});
				interaction.editReply(`<@${userId}> biểu quyết ${voted_name}`);
			} else {
				return interaction.editReply('Bạn không có quyền thực hiện thao tác này!');
			}
			if (voted.length >= 5 || user.roles.cache.find(r => r.name === 'admin')) {
				voted_msg = '';
				for (i = 0; i < voted.length; i++) {
					voted_msg += `${voted_users[voted[i]]} `;
				}
				embed.addField('Quyết định', voted_msg);
				for (i = 0; i < row.components.length; i++) {
					row.components[i].disabled = true;
				}
				for (i = 0; i<embed.fields.length; i++) {
					if (embed.fields[i].name === 'Biểu quyết') {
						embed.fields.splice(i, 1);
					}
				}

				uid = params[1];
				var minutes = params[2];
				var reason = interaction.message.embeds[0].fields[2].value;
				var result = await functions.accountLockAccount(uid, minutes, reason);
				embed.addField('Trạng thái', `${result.message.message}`);
				await interaction.message.edit({embeds: [embed], components: [row]});
			}
			break;
		}
	}
});

discordClient.on('guildMemberAdd', async function (member) {
	linkIOTAccount(member, true);
});

var scheduleReview = schedule.scheduleJob('0 */6 * * *',async function () {
	clearMessageInChannel('iot-updates').then(function() {
		sendAllWaitingAccount();
	});
});

async function clearMessageInChannel(channelName) {
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == channelName);
	var messages = await channel.messages.fetch();
	if (messages && messages.size > 0) {
		var promises = [];
		messages.forEach(async (msg) => {
			promises.push(msg.delete());
		});
		try {
			await Promise.all(promises);
		}
		catch (err) {
			console.log(err);
		}
		await clearMessageInChannel(channelName);
	}
	return;
}

async function sendAllWaitingAccount() {
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == 'iot-updates');
	channel.send('```Check Again!!!```');
	var accounts = (await functions.accountGetAccountReview()).data;
	if (accounts.length > 0) {
		await channel.send(`\`\`\`There are ${accounts.length} remaining accounts to be reviewed!\`\`\``);
		for (var user of accounts) {
			await channel.send(`/review ${user.email}`);
		}
	}
	return;
}

setTimeout(() => clearMessageInChannel('iot-updates'), 5000);


discordClient.login(process.env.DISCORD_BOT_KEY);

// ---------Firebase-------------- //

const database = firebase.database();
const auth = firebase.auth();

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

setTimeout(function() {
	refReviseRoom.on('child_added', function (snap) {
		discordCreateChannel(`Room ${snap.key}`, 'GUILD_VOICE', 'Revise Channels').then(function (invite) {
			if (process.env.PUBLIC == 'true')
				sendChatMessage(`/revise/chat/${snap.key}`, `Tham gia Discord: ${invite} Kênh thoại Phòng ${snap.key}!`);
		});
	});

	refReviseRoom.on('child_removed', function (snap) {
		discordRemoveChannel(`Room ${snap.key}`);
	});
}, 10000);

setInterval(function () {
	refReviseRoom.once('value', function (snap) {
		var data = snap.val() || {};
		var rooms = Array.from(Object.keys(data), function (key) {
			return `Room ${key}`;
		});
		discordClearChannel(rooms, 'GUILD_VOICE', 'Revise Channels');
	});
}, 300000);

// ------------------------------- //

var corsOptions = {
	origin: '*',
	optionsSuccessStatus: 200 // For legacy browser support
};


var app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.listen(process.env.PORT || 8080);

app.get('/', (req, res) => {
	res.send();
});

function upcaseFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

app.post('/discord_webhook',async (req, res) => {
	var data = req.body;
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == 'updates');
	var msg = new MessageEmbed()
		.setTitle(upcaseFirst(data.action) + (data.resource ? ' - ' : '') + (upcaseFirst(data.resource) || ''))
		.setTimestamp(data.updated_at);
	if (data.actor)
		msg.setAuthor(data.actor.email);
	if (data) {
		var temp = data.data;
		if (temp.app)
			msg.addField('App', temp.app.name);
		if (temp.status)
			msg.addField('Status', temp.status);
		if (temp.message)
			msg.addField('Message', temp.message);
		if (temp.source_blob)
			msg.addField('Code Version', temp.source_blob.version);
		if (temp.release)
			msg.addField('Version', temp.release.version.toString());
		if (temp.state)
			msg.addField('State', temp.state);
	}
	await channel.send({
		embeds: [msg]
	});

	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify({
		'status': 1,
		'message': 'success'
	}));
});

app.post('/fb_webhook', (req, res) => {	
	res.send('Hi there, I\'m running!');
});

app.post('/iot_chat', (req, res) => {
	var headers = req.headers;

	var data = req.body;
	var channel = discordClient.channels.cache.find(c => c.name.toLowerCase().trim() == 'iot-chat');
	var msg = `${data.name} (${data.username}) - room ${data.roomId}: ${data.text}`;
	channel.send(msg);
	res.send('Ok');	
});

app.post('/send_dm', (req, res) => {
	var data = req.body;
	if (data.uid && data.message) {
		discordClient.users.fetch(data.uid).then(function (user) {
			user.send(data.message);
		});
	}
	res.send('Ok');
});

setInterval(async function () {
	try {
		await fetch(process.env.HOMEPAGE || 'https://www.chinhphucvn.com');
	} catch (error) {
		console.error(error);
	}
}, 60000);