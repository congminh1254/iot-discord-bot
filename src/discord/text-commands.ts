import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	type APIEmbedField,
	type Message,
	type SendableChannels,
} from 'discord.js';
import moment from 'moment';
import { GREETING_LANGUAGES, GREETING_MSG } from '../config.ts';
import type { BotContext } from '../context.ts';
import { findUsersBy, lookupPlayer } from '../firebase.ts';
import { getIpData } from '../iot/socket-client.ts';
import type { IotUser } from '../types.ts';
import { getRankGradeName, parseTextCommand, permissionName, pickRandom } from '../utils.ts';
import { findSendableChannel } from './channels.ts';
import { linkIotAccount } from './link-account.ts';

const TZ = '+0700';
const formatDate = (seconds: number | undefined, format: string) => moment(seconds, 'X').utcOffset(TZ).format(format);
const MAX_RELATED_ACCOUNTS = 10;

/** One line per related account (same IP or same name), skipping the player themselves. */
export function describeRelatedAccounts(
	users: Record<string, IotUser>,
	excludeUsername: string | undefined,
	showSchool: (other: IotUser) => boolean,
): string {
	let value = '';
	let count = 0;
	for (const other of Object.values(users)) {
		if (other.name && other.username !== excludeUsername && ++count <= MAX_RELATED_ACCOUNTS) {
			const school = showSchool(other) ? ` - ${other.school?.schoolName}` : '';
			value += `${other.name} (${other.username})${school} - ${permissionName(other.permission)}\n`;
		}
	}
	return value;
}

async function ipFields(ctx: BotContext, user: IotUser, excludeUsername: string | undefined): Promise<APIEmbedField[]> {
	const ip = user.ip?.ip ?? user.ip?.query;
	if (!ip) return [];
	const fields: APIEmbedField[] = [];
	const sameIp = describeRelatedAccounts(await findUsersBy(ctx.database, 'ip/ip', ip), excludeUsername, () => !!user.school);
	if (sameIp) fields.push({ name: 'Account with same IP', value: sameIp });
	const ipData = await getIpData(ip);
	fields.push({ name: 'IP', value: `${ip} - ${ipData.country} - ${ipData.as}` });
	return fields;
}

function schoolText(user: IotUser, fallback: string): string {
	return user.school ? `${user.school.schoolName} - ${user.school.provinceName}` : fallback;
}

async function sendAccountProfile(ctx: BotContext, channel: SendableChannels, query: string) {
	const found = await lookupPlayer(ctx, query);
	if (!found) {
		await channel.send('Player not found :weary:');
		return;
	}
	const { uid, user } = found;
	const authUser = await ctx.auth.getUser(uid);
	const isLocked = !!user.block_time;
	const embed = new EmbedBuilder()
		.setColor('#e9a327')
		.setTitle('Player Profile')
		.addFields(
			{ name: 'Full name', value: user.name || 'null' },
			{ name: 'Username', value: user.username || 'null' },
			{ name: 'Email', value: user.email || 'null' },
			{ name: 'Roles', value: permissionName(user.permission) || 'null', inline: true },
			{ name: 'Ranking', value: getRankGradeName(user.talent) || 'null', inline: true },
			{ name: 'Birthday', value: formatDate(user.birthday, 'DD/MM/YYYY') || 'null' },
			{ name: 'School', value: schoolText(user, 'null') },
			{ name: 'Creation time', value: formatDate(user.created_at, 'DD/MM/YYYY HH:mm:ss') || 'null' },
			{
				name: 'Last sign-in time',
				value: moment(authUser.metadata.lastSignInTime).utcOffset(TZ).format('DD/MM/YYYY HH:mm:ss') || 'null',
			},
		)
		.setThumbnail(authUser.photoURL ?? null);
	embed.addFields(await ipFields(ctx, user, query.trim().toLowerCase()));
	if (isLocked) {
		embed.addFields(
			{ name: 'Lock until', value: formatDate(user.block_time ?? undefined, 'DD/MM/YYYY HH:mm:ss') },
			{ name: 'Lock reason', value: user.block_reason || 'null' },
		);
	}
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		isLocked
			? new ButtonBuilder().setCustomId(`unlock_${uid}`).setStyle(ButtonStyle.Primary).setLabel('Mở khóa')
			: new ButtonBuilder().setCustomId(`lock_${uid}`).setStyle(ButtonStyle.Primary).setLabel('Khóa'),
		new ButtonBuilder().setCustomId(`delete_${uid}`).setStyle(ButtonStyle.Danger).setLabel('Xóa'),
	);
	await channel.send({ embeds: [embed], components: [row] });
}

async function sendAccountReview(ctx: BotContext, msg: Message, channel: SendableChannels, query: string) {
	const found = await lookupPlayer(ctx, query);
	if (!found) {
		await channel.send('Player not found :weary:');
		return;
	}
	const { uid, user } = found;
	const authUser = await ctx.auth.getUser(uid);
	const embed = new EmbedBuilder()
		.setColor('#e9a327')
		.setTitle('Player Review')
		.addFields(
			{ name: 'Full name', value: user.name || ' - ' },
			{ name: 'Username', value: user.username || ' - ', inline: true },
			{ name: 'Email', value: user.email || ' - ', inline: true },
			{ name: 'Birthday', value: formatDate(user.birthday, 'DD/MM/YYYY') || ' - ' },
			{ name: 'School', value: schoolText(user, ' - ') },
			{ name: 'Creation time', value: formatDate(user.created_at, 'DD/MM/YYYY HH:mm:ss') || ' - ' },
		)
		.setThumbnail(authUser.photoURL ?? null)
		.setFooter({ text: uid });
	const username = user.username;
	if (username && user.name) {
		const sameName = describeRelatedAccounts(await findUsersBy(ctx.database, 'name', user.name), username, (other) => !!other.school);
		if (sameName) embed.addFields({ name: 'Account with same name', value: sameName });
	}
	embed.addFields(await ipFields(ctx, user, username));

	await channel.send(msg.author.bot ? '@here' : `<@${msg.author.id}>`);
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`approve_${uid}`).setLabel('Chấp nhận').setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(`reject_${uid}`).setLabel('Từ chối').setStyle(ButtonStyle.Danger),
	);
	const payload = { embeds: [embed], components: [row] };

	// Also open a private review channel for the reviewer assigned to the player's school.
	const schoolId = user.school?.schoolId;
	const reviewerId = schoolId
		? ((await ctx.database.ref(`/data/schools/${schoolId}/reviewerId`).once('value')).val() as string | null)
		: null;
	if (reviewerId) {
		const reviewerDiscord = (await ctx.database.ref(`/private_users/${reviewerId}/discord`).once('value')).val() as
			| IotUser['discord']
			| null;
		if (reviewerDiscord?.id) {
			const reviewer = await ctx.client.users.fetch(reviewerDiscord.id);
			ctx.channels
				.create(`review-${uid}`, ChannelType.GuildText, 'Review Channels', [reviewer], true)
				.then(async (reviewChannel) => {
					if (reviewChannel.isSendable()) await reviewChannel.send(payload);
				})
				.catch((err: unknown) => console.log(err));
		}
	}
	await channel.send(payload);
}

/** Deletes every message in a channel, page by page. */
export async function clearMessagesInChannel(ctx: BotContext, channelName: string): Promise<void> {
	const channel = findSendableChannel(ctx.client, channelName);
	if (!channel || !('messages' in channel)) return;
	for (;;) {
		const messages = await channel.messages.fetch();
		if (messages.size === 0) return;
		const results = await Promise.allSettled(messages.map((m) => m.delete()));
		const failed = results.filter((r) => r.status === 'rejected');
		if (failed.length > 0) {
			console.log(failed.map((r) => r.reason as unknown));
			if (failed.length === results.length) return;
		}
	}
}

/** Posts a `/review <email>` line in #iot-updates for every account awaiting review. */
export async function sendAllWaitingAccounts(ctx: BotContext): Promise<void> {
	const channel = findSendableChannel(ctx.client, 'iot-updates');
	if (!channel) return;
	await channel.send('```Check Again!!!```');
	const accounts = (await ctx.iot.getAccountsToReview()).data ?? [];
	if (accounts.length > 0) {
		await channel.send(`\`\`\`There are ${accounts.length} remaining accounts to be reviewed!\`\`\``);
		for (const user of accounts) await channel.send(`/review ${user.email}`);
	}
}

async function processIotTools(ctx: BotContext, msg: Message, channel: SendableChannels) {
	const { name, args } = parseTextCommand(msg.content);
	switch (name) {
		case '/acc':
			await sendAccountProfile(ctx, channel, args);
			break;
		case '/update-schools':
			await channel.send((await ctx.iot.updateSchools()).message);
			break;
	}
}

async function processIotUpdates(ctx: BotContext, msg: Message, channel: SendableChannels) {
	const { name, args } = parseTextCommand(msg.content);
	switch (name) {
		case '/review':
			await sendAccountReview(ctx, msg, channel, args);
			break;
		case '/review-all':
			await sendAllWaitingAccounts(ctx);
			break;
	}
}

async function processBotLogs(ctx: BotContext, msg: Message) {
	const { name } = parseTextCommand(msg.content);
	const guild = msg.guild;
	if (!guild) return;
	// Format: "/link <anything> <discord user id>"
	const memberId = msg.content.split(' ')[2];
	const linkMember = async (welcome: boolean) => {
		const member = memberId ? guild.members.cache.get(memberId) : undefined;
		if (member) await linkIotAccount(ctx.client, ctx.database, member, welcome);
		await msg.delete();
	};
	switch (name) {
		case '/link':
			await linkMember(true);
			break;
		case '/unlink':
		case '/relink':
			await linkMember(false);
			break;
		case '/relink-all':
			for (const member of guild.members.cache.values()) {
				if (!member.user.bot) await linkIotAccount(ctx.client, ctx.database, member, false);
			}
			break;
	}
}

// --- Emoji ---
interface EmojiEntry {
	title: string;
	image: string;
}
let emojiIndex: Map<string, EmojiEntry> | null = null;

export const EMOJI_PATTERN = /^:[^\s:\\/]+?:$/;

async function sendEmoji(msg: Message, channel: SendableChannels) {
	if (!emojiIndex) {
		const list = (await (await fetch('https://emoji.gg/api/')).json()) as EmojiEntry[];
		emojiIndex = new Map(list.map((item) => [item.title, item]));
	}
	const emoji = emojiIndex.get(msg.content.replace(/:/g, ''));
	if (emoji) await channel.send(emoji.image);
}

/** True when a human mentions "baymax" or the bot itself. */
export function isGreetingTrigger(content: string, authorIsBot: boolean, botUserId: string): boolean {
	if (authorIsBot) return false;
	return (
		content.toLowerCase().includes('baymax') || content.includes(`<@!${botUserId}>`) || content.includes(`<@${botUserId}>`)
	);
}

export async function handleMessage(ctx: BotContext, msg: Message): Promise<void> {
	const channel = msg.channel;
	if (!channel.isSendable()) return;
	const tasks: Promise<unknown>[] = [];
	if (EMOJI_PATTERN.test(msg.content)) tasks.push(sendEmoji(msg, channel));

	const channelName = 'name' in channel ? channel.name.toLowerCase().trim() : '';
	switch (channelName) {
		case 'iot-tools':
			tasks.push(processIotTools(ctx, msg, channel));
			break;
		case 'iot-updates':
			tasks.push(processIotUpdates(ctx, msg, channel));
			break;
		case 'bot-logs':
			tasks.push(processBotLogs(ctx, msg));
			break;
	}

	const botId = ctx.client.user?.id;
	if (botId && isGreetingTrigger(msg.content, msg.author.bot, botId)) {
		tasks.push(
			(async () => {
				const translation = await ctx.translate(pickRandom(GREETING_MSG), pickRandom(GREETING_LANGUAGES));
				await msg.reply(translation);
			})(),
		);
	}

	const results = await Promise.allSettled(tasks);
	for (const result of results) if (result.status === 'rejected') console.log(result.reason);
}
