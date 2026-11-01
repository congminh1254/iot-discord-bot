import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

const envSchema = z.object({
	DISCORD_BOT_KEY: nonEmpty,
	DISCORD_GUILD_ID: nonEmpty,
	DISCORD_APPLICATION_ID: nonEmpty.optional(),
	FIREBASE_CONFIG: nonEmpty,
	FIREBASE_SERVICE_ACCOUNT: nonEmpty,
	DEFAULT_ADMIN_UID: nonEmpty,
	IOT_SOCKET_URL: z.url(),
	IOT_SOCKET_STAT_URL: z.url().default('https://iot-socket.chinhphucvn.com/stat'),
	PORT: z.coerce.number().int().positive().default(8080),
	WEBHOOK_SECRET: z.string().trim().optional(),
	PUBLIC: z.string().optional().transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates the environment. Throws one readable error listing every missing or invalid variable. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
	const result = envSchema.safeParse(source);
	if (!result.success) {
		const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
		throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
	}
	return result.data;
}

/** Decodes a base64-encoded JSON environment variable. */
export function decodeBase64Json<T>(value: string, name: string): T {
	try {
		return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
	} catch (err) {
		throw new Error(`${name} is not valid base64-encoded JSON`, { cause: err });
	}
}

/** Loads `.env` when present (Node's built-in loader), without overriding real environment variables. */
export function loadDotEnv(path = '.env'): void {
	try {
		process.loadEnvFile(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}
