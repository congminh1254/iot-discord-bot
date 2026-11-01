import type { Client } from 'discord.js';
import type { Auth } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import type { ChannelManager } from './discord/channels.ts';
import type { Env } from './env.ts';
import type { IotClient } from './iot/socket-client.ts';

/** Everything the handlers need, wired once in main.ts. */
export interface BotContext {
	env: Env;
	client: Client;
	channels: ChannelManager;
	database: Database;
	auth: Auth;
	iot: IotClient;
	translate: (text: string, language: string) => Promise<string>;
}
