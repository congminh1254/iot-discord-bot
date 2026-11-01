import type { ButtonInteraction, Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import type { Database } from 'firebase-admin/database';
import { getUser } from '../firebase.ts';
import type { IotClient } from '../iot/socket-client.ts';

const CONFIRM = '✅';
const CANCEL = '❎';
const WAIT_MS = 60_000;

export interface AccountActionDeps {
	database: Database;
	iot: IotClient;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : '';
}

function sendable(message: Message) {
	if (!message.channel.isSendable()) throw new Error('Channel is not sendable');
	return message.channel;
}

/** Posts a ✅/❎ prompt and waits for one reaction from someone other than the bot. */
async function askConfirmation(
	interaction: ButtonInteraction,
	text: string,
	onlyRequester: boolean,
): Promise<{ confirmed: boolean; prompt: Message }> {
	const original = interaction.message;
	await original.delete();
	const channel = sendable(original);
	const prompt = await channel.send(`\`\`\`${text}\`\`\``);
	await Promise.all([prompt.react(CONFIRM), prompt.react(CANCEL)]);
	const filter = (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) =>
		[CONFIRM, CANCEL].includes(reaction.emoji.name ?? '') &&
		user.id !== prompt.author.id &&
		(!onlyRequester || user.id === interaction.user.id);
	const collected = await prompt
		.awaitReactions({ filter, max: 1, time: WAIT_MS, errors: ['time'] })
		.catch(() => {
			throw new Error('You do not have any react.');
		});
	return { confirmed: collected.first()?.emoji.name === CONFIRM, prompt };
}

/** Waits for the next message from the user who pressed the button. */
async function askText(interaction: ButtonInteraction, channelMessage: Message, question: string): Promise<string> {
	const channel = sendable(channelMessage);
	const questionMsg = await channel.send(question);
	const collected = await channel
		.awaitMessages({
			filter: (m) => m.author.id === interaction.user.id,
			max: 1,
			time: WAIT_MS,
			errors: ['time'],
		})
		.catch(() => {
			throw new Error('```You do not have any message.```');
		});
	await questionMsg.delete();
	const reply = collected.first();
	if (!reply) throw new Error('```You do not have any message.```');
	const content = reply.content;
	await reply.delete();
	return content;
}

export async function deleteAccount(deps: AccountActionDeps, interaction: ButtonInteraction, uid: string): Promise<void> {
	try {
		const user = await getUser(deps.database, uid);
		const { confirmed, prompt } = await askConfirmation(
			interaction,
			`Are you sure? Delete account ${user?.name} (${user?.username})`,
			false,
		);
		await prompt.delete();
		if (confirmed) {
			const result = await deps.iot.deleteAccount(uid);
			await interaction.editReply(`\`\`\`${result.message}\`\`\``);
		} else {
			await interaction.editReply('Cancel Deleted!');
		}
	} catch (err) {
		await interaction.editReply(`Request error! ${errorMessage(err)}`);
	}
}

export async function unlockAccount(deps: AccountActionDeps, interaction: ButtonInteraction, uid: string): Promise<void> {
	try {
		const user = await getUser(deps.database, uid);
		const { confirmed, prompt } = await askConfirmation(
			interaction,
			`Are you sure? Unlock account ${user?.name} (${user?.username})`,
			false,
		);
		await prompt.delete();
		if (confirmed) {
			const result = await deps.iot.unlockAccount(uid);
			await interaction.editReply(`\`\`\`${result.message}\`\`\``);
		} else {
			await interaction.editReply('```Cancel Unlocked!```');
		}
	} catch (err) {
		await interaction.editReply(`Request error! ${errorMessage(err)}`);
	}
}

export async function lockAccount(deps: AccountActionDeps, interaction: ButtonInteraction, uid: string): Promise<void> {
	try {
		const user = await getUser(deps.database, uid);
		const { confirmed, prompt } = await askConfirmation(
			interaction,
			`Are you sure? Lock account ${user?.name} (${user?.username})`,
			true,
		);
		await prompt.delete();
		if (!confirmed) {
			await interaction.editReply('```Cancel Locked!```');
			return;
		}
		const days = parseInt(await askText(interaction, prompt, '```How many days?```'), 10);
		if (isNaN(days)) throw new Error('```Number of days is not valid.```');
		const reason = await askText(interaction, prompt, `\`\`\`You'll lock this account ${days} day(s). Why?\`\`\``);
		const channel = sendable(prompt);
		const notice = await channel.send(`\`\`\`You'll lock this account ${days} day(s). Reason: ${reason}.\`\`\``);
		const result = await deps.iot.lockAccount(uid, days * 24 * 60, reason);
		await interaction.editReply(`\`\`\`${result.message}\`\`\``);
		await notice.delete();
	} catch (err) {
		await interaction.editReply(`Request error! ${errorMessage(err)}`);
	}
}
