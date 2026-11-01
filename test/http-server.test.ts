import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeployEmbed, createHttpServer, formatIotChatMessage, type DiscordGateway } from '../src/http/server.ts';

function fakeGateway() {
	return {
		sendEmbedToChannel: vi.fn<DiscordGateway['sendEmbedToChannel']>().mockResolvedValue(undefined),
		sendToChannel: vi.fn<DiscordGateway['sendToChannel']>().mockResolvedValue(undefined),
		sendDirectMessage: vi.fn<DiscordGateway['sendDirectMessage']>().mockResolvedValue(undefined),
	};
}

describe('POST /send_dm', () => {
	let discord: ReturnType<typeof fakeGateway>;
	beforeEach(() => {
		discord = fakeGateway();
	});

	it('is disabled when no secret is configured', async () => {
		const app = createHttpServer({ discord, webhookSecret: undefined });
		await request(app).post('/send_dm').send({ uid: '1', message: 'hi' }).expect(503);
		expect(discord.sendDirectMessage).not.toHaveBeenCalled();
	});

	it('rejects requests without the bearer secret', async () => {
		const app = createHttpServer({ discord, webhookSecret: 's3cret' });
		await request(app).post('/send_dm').send({ uid: '1', message: 'hi' }).expect(401);
		await request(app).post('/send_dm').set('Authorization', 'Bearer wrong').send({ uid: '1', message: 'hi' }).expect(401);
		await request(app).post('/send_dm').set('Authorization', 's3cret').send({ uid: '1', message: 'hi' }).expect(401);
		expect(discord.sendDirectMessage).not.toHaveBeenCalled();
	});

	it('sends the DM with the right secret', async () => {
		const app = createHttpServer({ discord, webhookSecret: 's3cret' });
		await request(app)
			.post('/send_dm')
			.set('Authorization', 'Bearer s3cret')
			.send({ uid: '42', message: 'Xin chào' })
			.expect(200, 'Ok');
		expect(discord.sendDirectMessage).toHaveBeenCalledWith('42', 'Xin chào');
	});

	it('answers Ok but sends nothing for an incomplete body', async () => {
		const app = createHttpServer({ discord, webhookSecret: 's3cret' });
		await request(app).post('/send_dm').set('Authorization', 'Bearer s3cret').send({ uid: '42' }).expect(200);
		expect(discord.sendDirectMessage).not.toHaveBeenCalled();
	});
});

describe('other endpoints', () => {
	it('relays IOT chat to #iot-chat', async () => {
		const discord = fakeGateway();
		const app = createHttpServer({ discord });
		await request(app).post('/iot_chat').send({ name: 'An', username: 'an', roomId: 7, text: 'hello' }).expect(200, 'Ok');
		expect(discord.sendToChannel).toHaveBeenCalledWith('iot-chat', 'An (an) - room 7: hello');
	});

	it('posts deploy webhooks to #updates', async () => {
		const discord = fakeGateway();
		const app = createHttpServer({ discord });
		const res = await request(app)
			.post('/discord_webhook')
			.send({ action: 'create', resource: 'release', data: { app: { name: 'iot' }, release: { version: 12 } } })
			.expect(200);
		expect(res.body).toEqual({ status: 1, message: 'success' });
		expect(discord.sendEmbedToChannel).toHaveBeenCalledWith('updates', {
			title: 'Create - Release',
			timestamp: undefined,
			author: undefined,
			fields: [
				{ name: 'App', value: 'iot' },
				{ name: 'Version', value: '12' },
			],
		});
	});

	it('returns 500 instead of crashing when Discord fails', async () => {
		const discord = fakeGateway();
		discord.sendToChannel.mockRejectedValue(new Error('discord down'));
		const app = createHttpServer({ discord });
		await request(app).post('/iot_chat').send({ text: 'x' }).expect(500);
	});

	it('keeps the health endpoints', async () => {
		const app = createHttpServer({ discord: fakeGateway() });
		await request(app).get('/').expect(200);
		await request(app).post('/fb_webhook').expect(200, "Hi there, I'm running!");
	});
});

describe('payload formatting', () => {
	it('builds deploy embeds with every known field', () => {
		const embed = buildDeployEmbed({
			action: 'update',
			actor: { email: 'dev@example.com' },
			updated_at: '2026-01-01T00:00:00Z',
			data: { status: 'succeeded', message: 'm', source_blob: { version: 'abc' }, state: 'up' },
		});
		expect(embed.title).toBe('Update');
		expect(embed.author).toBe('dev@example.com');
		expect(embed.fields.map((f) => f.name)).toEqual(['Status', 'Message', 'Code Version', 'State']);
	});

	it('formats chat lines', () => {
		expect(formatIotChatMessage({ name: 'A', username: 'a', roomId: '1', text: 't' })).toBe('A (a) - room 1: t');
	});
});
