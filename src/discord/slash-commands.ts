import { ChannelType, EmbedBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import type { BotContext } from '../context.ts';
import { getIotUidFromDiscordId } from '../firebase.ts';
import { formatUptime } from '../utils.ts';
import { linkIotAccount } from './link-account.ts';
import { generateIotProfile } from './profile-card.ts';

const SUPPORT_CATEGORY = 'help channels';
const SUPPORT_IDLE_MS = 5 * 60 * 1000;
const TRUSTED_ROLES = ['admin', 'moderator', 'verified-player'];

export function hasAnyRole(member: GuildMember | null | undefined, roleNames: readonly string[]): boolean {
	return !!member?.roles.cache.some((r) => roleNames.includes(r.name));
}

interface ServerStat {
	online: number;
	freemem: number;
	totalmem: number;
	uptime: number;
}

export function formatServerStatus(stat: ServerStat): string {
	const mb = (bytes: number) => Math.floor(bytes / 1024 / 1024);
	return (
		`IOT server status: \n- Online: ${stat.online} players.` +
		` \n- Free memory: ${mb(stat.freemem)}/${mb(stat.totalmem)}MB` +
		`\n- Uptime: ${formatUptime(stat.uptime)}`
	);
}

async function member(interaction: ChatInputCommandInteraction): Promise<GuildMember | null> {
	return interaction.guild ? interaction.guild.members.fetch(interaction.user.id) : null;
}

async function handleServer(ctx: BotContext, interaction: ChatInputCommandInteraction) {
	let serverStatus = 'Server is down';
	try {
		const stat = (await (await fetch(ctx.env.IOT_SOCKET_STAT_URL)).json()) as ServerStat;
		serverStatus = formatServerStatus(stat);
	} catch (err) {
		console.log(err);
	}
	await interaction.reply(
		`\`\`\`\nServer name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}\n${serverStatus}\n\`\`\``,
	);
}

async function handleIot(ctx: BotContext, interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	const target = interaction.options.getUser('user') ?? interaction.user;
	const uid = await getIotUidFromDiscordId(ctx.database, target.id);
	if (!uid) {
		await interaction.editReply('User not found!');
		return;
	}
	const buffer = await generateIotProfile(ctx.database, uid);
	await interaction.editReply({ files: [buffer] });
}

async function handleSupport(ctx: BotContext, interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	const caseId = Math.floor(Math.random() * 1_000_000);
	const channelName = `case_${caseId}`;
	const channel = await ctx.channels.create(channelName, ChannelType.GuildText, SUPPORT_CATEGORY);
	if (!channel.isTextBased() || !('permissionOverwrites' in channel)) throw new Error('Support channel is not a text channel');
	await channel.permissionOverwrites.edit(interaction.user, { ViewChannel: true, SendMessages: true });

	const embed = new EmbedBuilder()
		.setColor('#0099ff')
		.setTitle(`Support Request - Case ${caseId}`)
		.setDescription(`${interaction.user.toString()} gửi yêu cầu hỗ trợ, vui lòng đợi quản trị viên trả lời.`)
		.setTimestamp()
		.addFields(
			{ name: 'Tham gia', value: `<@${interaction.user.id}> @here` },
			{
				name: 'Hướng dẫn',
				value: 'Bạn hãy giải thích vấn đề gặp phải và chờ quản trị viên giải quyết nhé.\nSau khi kết thúc, gõ /done để xóa kênh.',
			},
		);
	await channel.send({ embeds: [embed] });
	await channel.send(`<@${interaction.user.id}>`);

	if (hasAnyRole(await member(interaction), TRUSTED_ROLES)) {
		const uid = await getIotUidFromDiscordId(ctx.database, interaction.user.id);
		if (!uid) {
			await channel.send('User not found!');
			return;
		}
		await channel.send({ files: [await generateIotProfile(ctx.database, uid)] });
	}
	await interaction.editReply(`Vui lòng gửi tin nhắn vào kênh <#${channel.id}> để giải quyết vấn đề.`);

	// If the user has not written in the channel within 5 minutes, delete it.
	setTimeout(() => {
		void (async () => {
			const current = interaction.guild?.channels.cache.find((c) => c.name === channelName);
			if (!current?.isTextBased()) return;
			const messages = await current.messages.fetch();
			if (!messages.some((m) => m.author.id === interaction.user.id)) {
				await ctx.channels.remove(channelName, ChannelType.GuildText);
			}
		})().catch((err: unknown) => console.log(err));
	}, SUPPORT_IDLE_MS);
}

async function handleDone(ctx: BotContext, interaction: ChatInputCommandInteraction) {
	const channel = interaction.channel;
	if (channel && 'name' in channel && channel.name?.startsWith('case_')) {
		await interaction.reply('Vui lòng đợi!');
		await ctx.channels.remove(channel.name ?? '', ChannelType.GuildText);
	} else {
		await interaction.reply('Kênh không hợp lệ!');
	}
}

async function withLinkedAccount(
	ctx: BotContext,
	interaction: ChatInputCommandInteraction,
	action: (uid: string) => Promise<string>,
) {
	await interaction.deferReply();
	const uid = await getIotUidFromDiscordId(ctx.database, interaction.user.id);
	if (!uid) {
		await interaction.editReply('Tài khoản chưa liên kết với IOT!');
		return;
	}
	await interaction.editReply(await action(uid));
}

export async function handleChatInputCommand(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
	switch (interaction.commandName) {
		case 'ping':
			await interaction.reply('Pong!');
			break;
		case 'server':
			await handleServer(ctx, interaction);
			break;
		case 'user':
			await interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
			break;
		case 'iot':
			await handleIot(ctx, interaction);
			break;
		case 'support':
			await handleSupport(ctx, interaction);
			break;
		case 'done':
			await handleDone(ctx, interaction);
			break;
		case 'update-role':
			await withLinkedAccount(ctx, interaction, async () => {
				const guildMember = await member(interaction);
				if (guildMember) await linkIotAccount(ctx.client, ctx.database, guildMember, false);
				return 'Cập nhật thành công!';
			});
			break;
		case 'apply-reviewer':
			await withLinkedAccount(ctx, interaction, async (uid) => (await ctx.iot.applyReviewer(uid)).message);
			break;
		case 'resign-reviewer':
			await withLinkedAccount(ctx, interaction, async (uid) => (await ctx.iot.resignReviewer(uid)).message);
			break;
	}
}
