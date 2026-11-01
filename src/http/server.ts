import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import { z } from 'zod';
import { upcaseFirst } from '../utils.ts';

/** What the HTTP layer needs from Discord, kept narrow so it can be faked in tests. */
export interface DiscordGateway {
	sendEmbedToChannel(channelName: string, embed: DeployEmbed): Promise<void>;
	sendToChannel(channelName: string, text: string): Promise<void>;
	sendDirectMessage(discordUserId: string, text: string): Promise<void>;
}

export interface DeployEmbed {
	title: string;
	timestamp?: string;
	author?: string;
	fields: { name: string; value: string }[];
}

export interface HttpServerOptions {
	discord: DiscordGateway;
	/** Shared secret for `/send_dm`. When empty the endpoint is disabled. */
	webhookSecret?: string | undefined;
}

function safeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

/** Requires `Authorization: Bearer <secret>`. Fails closed when no secret is configured. */
export function requireBearerSecret(secret: string | undefined): RequestHandler {
	return (req, res, next) => {
		if (!secret) {
			res.status(503).json({ status: 0, message: 'Endpoint disabled: WEBHOOK_SECRET is not configured' });
			return;
		}
		const header = req.get('authorization') ?? '';
		const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
		if (!token || !safeEqual(token, secret)) {
			res.status(401).json({ status: 0, message: 'Unauthorized' });
			return;
		}
		next();
	};
}

const deployWebhookSchema = z.looseObject({
	action: z.string().default(''),
	resource: z.string().optional(),
	updated_at: z.string().optional(),
	actor: z.looseObject({ email: z.string().optional() }).optional(),
	data: z
		.looseObject({
			app: z.looseObject({ name: z.string() }).optional(),
			status: z.string().optional(),
			message: z.string().optional(),
			source_blob: z.looseObject({ version: z.string() }).optional(),
			release: z.looseObject({ version: z.union([z.string(), z.number()]) }).optional(),
			state: z.string().optional(),
		})
		.default({}),
});

/** Builds the #updates embed for a deploy (Heroku-style app webhook) notification. */
export function buildDeployEmbed(body: unknown): DeployEmbed {
	const data = deployWebhookSchema.parse(body ?? {});
	const fields: DeployEmbed['fields'] = [];
	const d = data.data;
	if (d.app) fields.push({ name: 'App', value: d.app.name });
	if (d.status) fields.push({ name: 'Status', value: d.status });
	if (d.message) fields.push({ name: 'Message', value: d.message });
	if (d.source_blob) fields.push({ name: 'Code Version', value: d.source_blob.version });
	if (d.release) fields.push({ name: 'Version', value: d.release.version.toString() });
	if (d.state) fields.push({ name: 'State', value: d.state });
	return {
		title: upcaseFirst(data.action) + (data.resource ? ` - ${upcaseFirst(data.resource)}` : ''),
		timestamp: data.updated_at,
		author: data.actor?.email,
		fields,
	};
}

const iotChatSchema = z.object({
	name: z.string().optional(),
	username: z.string().optional(),
	roomId: z.union([z.string(), z.number()]).optional(),
	text: z.string().optional(),
});

export function formatIotChatMessage(body: unknown): string {
	const data = iotChatSchema.parse(body ?? {});
	return `${data.name} (${data.username}) - room ${data.roomId}: ${data.text}`;
}

const sendDmSchema = z.object({
	uid: z.string().min(1),
	message: z.string().min(1).max(2000),
});

export function createHttpServer({ discord, webhookSecret }: HttpServerOptions): Express {
	const app = express();
	app.use(cors({ origin: '*', optionsSuccessStatus: 200 }));
	app.use(express.json());

	app.get('/', (_req, res) => {
		res.send();
	});

	app.post('/discord_webhook', async (req, res) => {
		await discord.sendEmbedToChannel('updates', buildDeployEmbed(req.body));
		res.json({ status: 1, message: 'success' });
	});

	app.post('/fb_webhook', (_req, res) => {
		res.send("Hi there, I'm running!");
	});

	app.post('/iot_chat', async (req, res) => {
		await discord.sendToChannel('iot-chat', formatIotChatMessage(req.body));
		res.send('Ok');
	});

	app.post('/send_dm', requireBearerSecret(webhookSecret), (req, res) => {
		const parsed = sendDmSchema.safeParse(req.body);
		if (parsed.success) {
			discord.sendDirectMessage(parsed.data.uid, parsed.data.message).catch((err: unknown) => console.log(err));
		}
		res.send('Ok');
	});

	app.use(((err, _req, res, _next) => {
		console.log(err);
		if (err instanceof z.ZodError) {
			res.status(400).json({ status: 0, message: 'Invalid request body' });
			return;
		}
		res.status(500).json({ status: 0, message: 'Internal error' });
	}) satisfies express.ErrorRequestHandler);

	return app;
}
