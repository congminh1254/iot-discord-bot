import { describe, expect, it } from 'vitest';
import { decodeBase64Json, parseEnv } from '../src/env.ts';

const valid = {
	DISCORD_BOT_KEY: 'token',
	DISCORD_GUILD_ID: '123',
	FIREBASE_CONFIG: 'e30=',
	FIREBASE_SERVICE_ACCOUNT: 'e30=',
	DEFAULT_ADMIN_UID: 'admin',
	IOT_SOCKET_URL: 'https://iot-socket.example.com',
};

describe('parseEnv', () => {
	it('applies defaults', () => {
		const env = parseEnv(valid);
		expect(env.PORT).toBe(8080);
		expect(env.PUBLIC).toBe(false);
		expect(env.WEBHOOK_SECRET).toBeUndefined();
	});

	it('parses PORT and PUBLIC', () => {
		const env = parseEnv({ ...valid, PORT: '3000', PUBLIC: 'true' });
		expect(env.PORT).toBe(3000);
		expect(env.PUBLIC).toBe(true);
	});

	it('lists every missing variable in one error', () => {
		expect(() => parseEnv({ DISCORD_GUILD_ID: '1' })).toThrow(/DISCORD_BOT_KEY[\s\S]*IOT_SOCKET_URL/);
	});

	it('rejects blank secrets', () => {
		expect(() => parseEnv({ ...valid, DISCORD_BOT_KEY: '   ' })).toThrow(/DISCORD_BOT_KEY/);
	});
});

describe('decodeBase64Json', () => {
	it('decodes UTF-8 JSON', () => {
		const encoded = Buffer.from(JSON.stringify({ name: 'Trường' })).toString('base64');
		expect(decodeBase64Json<{ name: string }>(encoded, 'X')).toEqual({ name: 'Trường' });
	});

	it('names the variable when decoding fails', () => {
		expect(() => decodeBase64Json('not json', 'FIREBASE_CONFIG')).toThrow(/FIREBASE_CONFIG/);
	});
});
