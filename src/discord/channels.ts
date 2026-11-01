import {
	ChannelType,
	type CategoryChannel,
	type Client,
	type GuildBasedChannel,
	type SendableChannels,
	type User,
} from 'discord.js';

export type ManagedChannelType = ChannelType.GuildText | ChannelType.GuildVoice;

const same = (a: string | null | undefined, b: string | null | undefined) =>
	(a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export class ChannelManager {
	private readonly client: Client;
	private readonly guildId: string;

	constructor(client: Client, guildId: string) {
		this.client = client;
		this.guildId = guildId;
	}

	private guild() {
		return this.client.guilds.fetch(this.guildId);
	}

	async getCategory(categoryName: string | null): Promise<CategoryChannel | null> {
		if (!categoryName) return null;
		const guild = await this.guild();
		const category = guild.channels.cache.find(
			(c): c is CategoryChannel => c.type === ChannelType.GuildCategory && same(c.name, categoryName),
		);
		if (!category) throw new Error(`Category channel ${categoryName} does not exist`);
		return category;
	}

	/** Finds or creates a channel in a category, optionally recreating it, and grants extra users access. */
	async create(
		name: string,
		type: ManagedChannelType = ChannelType.GuildVoice,
		categoryName: string | null = null,
		additionalUsers: User[] = [],
		recreate = false,
	): Promise<GuildBasedChannel> {
		const guild = await this.guild();
		const category = await this.getCategory(categoryName);
		let channel: GuildBasedChannel | null =
			guild.channels.cache.find(
				(c) => c.type === type && same(c.name, name) && same(c.parent?.name, categoryName),
			) ?? null;
		if (recreate && channel) {
			await channel.delete();
			channel = null;
		}
		channel ??= await guild.channels.create({
			name,
			type,
			userLimit: 5,
			parent: category?.id ?? null,
		});
		const created = channel;
		if ('permissionOverwrites' in created) {
			await Promise.all(
				additionalUsers.map((user) =>
					created.permissionOverwrites.edit(user, { ViewChannel: true, SendMessages: true }),
				),
			);
		}
		return created;
	}

	async remove(name: string, type: ManagedChannelType = ChannelType.GuildVoice): Promise<void> {
		const guild = await this.guild();
		const targets = guild.channels.cache.filter((c) => c.type === type && same(c.name, name));
		await Promise.all(targets.map((c) => c.delete()));
	}

	/** Deletes every channel of `type` in the category whose name is not in `keep`. */
	async clear(keep: string[], type: ManagedChannelType, categoryName: string): Promise<void> {
		const guild = await this.guild();
		const targets = guild.channels.cache.filter(
			(c) => c.type === type && !keep.includes(c.name) && same(c.parent?.name, categoryName),
		);
		await Promise.all(targets.map((c) => c.delete()));
	}
}

/** Finds a sendable channel anywhere in the client's cache by (case-insensitive) name. */
export function findSendableChannel(client: Client, name: string): SendableChannels | undefined {
	const channel = client.channels.cache.find((c) => 'name' in c && same(c.name, name));
	return channel?.isSendable() ? channel : undefined;
}
