import { v2 as translateV2 } from '@google-cloud/translate';
import { ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits, Partials } from 'discord.js';
import schedule from 'node-schedule';
import type { BotContext } from './context.ts';
import { handleButton } from './discord/buttons.ts';
import { ChannelManager, findSendableChannel } from './discord/channels.ts';
import { linkIotAccount } from './discord/link-account.ts';
import { handleChatInputCommand } from './discord/slash-commands.ts';
import { clearMessagesInChannel, handleMessage, sendAllWaitingAccounts } from './discord/text-commands.ts';
import { loadDotEnv, parseEnv } from './env.ts';
import { initFirebase } from './firebase.ts';
import { createHttpServer, type DiscordGateway } from './http/server.ts';
import { startReviseRoomSync } from './iot/revise-rooms.ts';
import { IotClient } from './iot/socket-client.ts';

loadDotEnv();
const env = parseEnv(process.env);
const firebase = initFirebase(env);

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		// Privileged: must be enabled for the bot in the Discord Developer Portal.
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const translator = new translateV2.Translate();

const ctx: BotContext = {
	env,
	client,
	channels: new ChannelManager(client, env.DISCORD_GUILD_ID),
	database: firebase.database,
	auth: firebase.auth,
	iot: new IotClient({
		auth: firebase.auth,
		apiKey: firebase.webConfig.apiKey,
		socketUrl: env.IOT_SOCKET_URL,
		defaultAdminUid: env.DEFAULT_ADMIN_UID,
	}),
	translate: async (text, language) => {
		const [translation] = await translator.translate(text, language);
		return translation;
	},
};

const logError = (err: unknown) => console.error(err);

// --------- Discord --------- //

client.once(Events.ClientReady, (ready) => {
	console.log(`Logged in as ${ready.user.tag}!`);
	ready.user.setActivity('IOT - IMIN Olympia Training', {
		type: ActivityType.Playing,
		url: 'https://iot.chinhphucvn.com',
	});
	setTimeout(() => {
		clearMessagesInChannel(ctx, 'iot-updates').catch(logError);
	}, 5000);
});

client.on(Events.MessageCreate, (msg) => {
	handleMessage(ctx, msg).catch(logError);
});

client.on(Events.InteractionCreate, (interaction) => {
	const run = async () => {
		if (interaction.isChatInputCommand()) await handleChatInputCommand(ctx, interaction);
		else if (interaction.isButton()) await handleButton(ctx, interaction);
	};
	run().catch(async (err: unknown) => {
		logError(err);
		if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
			await interaction.editReply('Request error!').catch(logError);
		}
	});
});

client.on(Events.GuildMemberAdd, (member) => {
	linkIotAccount(client, ctx.database, member, true).catch(logError);
});

// Every 6 hours, repost the queue of accounts waiting for review.
schedule.scheduleJob('0 */6 * * *', () => {
	clearMessagesInChannel(ctx, 'iot-updates')
		.then(() => sendAllWaitingAccounts(ctx))
		.catch(logError);
});

await client.login(env.DISCORD_BOT_KEY);

// --------- Firebase --------- //

ctx.iot.getIdToken().catch(logError);
setTimeout(() => startReviseRoomSync(ctx), 10_000);

// --------- HTTP --------- //

const gateway: DiscordGateway = {
	async sendEmbedToChannel(channelName, data) {
		const embed = new EmbedBuilder().addFields(data.fields);
		if (data.title) embed.setTitle(data.title);
		embed.setTimestamp(data.timestamp ? new Date(data.timestamp) : new Date());
		if (data.author) embed.setAuthor({ name: data.author });
		await findSendableChannel(client, channelName)?.send({ embeds: [embed] });
	},
	async sendToChannel(channelName, text) {
		await findSendableChannel(client, channelName)?.send(text);
	},
	async sendDirectMessage(discordUserId, text) {
		const user = await client.users.fetch(discordUserId);
		await user.send(text);
	},
};

if (!env.WEBHOOK_SECRET) console.warn('WEBHOOK_SECRET is not set: POST /send_dm is disabled.');

createHttpServer({ discord: gateway, webhookSecret: env.WEBHOOK_SECRET }).listen(env.PORT, () => {
	console.log(`HTTP server listening on port ${env.PORT}`);
});
