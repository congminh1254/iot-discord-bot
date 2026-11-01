import { ChannelType } from 'discord.js';
import type { BotContext } from '../context.ts';

const CATEGORY = 'Revise Channels';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export const roomChannelName = (roomId: string) => `Room ${roomId}`;

async function sendChatMessage(ctx: BotContext, path: string, text: string) {
	const messageId = Date.now();
	await ctx.database.ref(`${path}/messages/${messageId}/`).set({
		name: 'Chatbot',
		timestamp: messageId,
		permission: 100,
		text,
	});
}

/**
 * Mirrors IOT revise rooms as Discord voice channels: one channel per room in
 * `/revise/room/`, created when a room opens and deleted when it closes.
 * Returns a function that stops the sync.
 */
export function startReviseRoomSync(ctx: BotContext): () => void {
	const ref = ctx.database.ref('/revise/room/');

	const onAdded = ref.on('child_added', (snap) => {
		const roomId = snap.key ?? '';
		ctx.channels
			.create(roomChannelName(roomId), ChannelType.GuildVoice, CATEGORY)
			.then(async (channel) => {
				if (!('createInvite' in channel)) return;
				const invite = await channel.createInvite({ maxAge: 60 * 60, maxUses: 4 });
				if (ctx.env.PUBLIC) {
					await sendChatMessage(
						ctx,
						`/revise/chat/${roomId}`,
						`Tham gia Discord: ${invite.url} Kênh thoại Phòng ${roomId}!`,
					);
				}
			})
			.catch((err: unknown) => console.log(err));
	});

	const onRemoved = ref.on('child_removed', (snap) => {
		ctx.channels.remove(roomChannelName(snap.key ?? '')).catch((err: unknown) => console.log(err));
	});

	const timer = setInterval(() => {
		ref
			.once('value')
			.then((snap) => {
				const rooms = Object.keys((snap.val() as Record<string, unknown> | null) ?? {}).map(roomChannelName);
				return ctx.channels.clear(rooms, ChannelType.GuildVoice, CATEGORY);
			})
			.catch((err: unknown) => console.log(err));
	}, SYNC_INTERVAL_MS);

	return () => {
		clearInterval(timer);
		ref.off('child_added', onAdded);
		ref.off('child_removed', onRemoved);
	};
}
