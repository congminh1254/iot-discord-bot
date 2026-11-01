import { ChannelType, SnowflakeUtil, type Client, type TextChannel } from 'discord.js';
import { SUPPORT_CATEGORY } from './slash-commands.ts';

export const SUPPORT_INACTIVE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a channel last saw activity: its newest message, or its creation if it has none. */
export function lastActivityAt(channel: Pick<TextChannel, 'lastMessageId' | 'createdTimestamp'>): number {
	return channel.lastMessageId ? SnowflakeUtil.timestampFrom(channel.lastMessageId) : channel.createdTimestamp;
}

export function isInactive(lastActivity: number, now: number, days = SUPPORT_INACTIVE_DAYS): boolean {
	return now - lastActivity > days * DAY_MS;
}

/** True for support case channels created by `/support` (`case_<id>` under the help category). */
export function isSupportChannel(channel: { name: string; parent?: { name: string } | null }): boolean {
	return (
		channel.name.startsWith('case_') &&
		(channel.parent?.name ?? '').trim().toLowerCase() === SUPPORT_CATEGORY
	);
}

/** Deletes support channels with no activity for more than 14 days. Returns the deleted channel names. */
export async function deleteInactiveSupportChannels(client: Client, guildId: string, now = Date.now()): Promise<string[]> {
	const guild = await client.guilds.fetch(guildId);
	const channels = await guild.channels.fetch();
	const stale = channels.filter(
		(c): c is TextChannel =>
			c?.type === ChannelType.GuildText && isSupportChannel(c) && isInactive(lastActivityAt(c), now),
	);
	const deleted: string[] = [];
	for (const channel of stale.values()) {
		try {
			await channel.delete(`Support case inactive for more than ${SUPPORT_INACTIVE_DAYS} days`);
			deleted.push(channel.name);
		} catch (err) {
			console.log(err);
		}
	}
	if (deleted.length > 0) console.log(`Deleted inactive support channels: ${deleted.join(', ')}`);
	return deleted;
}
