import type { Auth } from 'firebase-admin/auth';
import type { io } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IotClient } from '../src/iot/socket-client.ts';

function setup() {
	const createCustomToken = vi.fn().mockResolvedValue('custom-token');
	const auth = { createCustomToken } as unknown as Auth;
	const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ idToken: 'id-token' })));
	const socket = {
		connected: true,
		on: vi.fn(),
		disconnect: vi.fn(),
		emit: vi.fn((_event: string, _name: string, _payload: unknown, ack: (r: unknown) => void) => ack({ message: 'done' })),
	};
	const connect = vi.fn().mockReturnValue(socket) as unknown as typeof io;
	const client = new IotClient({
		auth,
		apiKey: 'KEY',
		socketUrl: 'https://socket.example',
		defaultAdminUid: 'admin',
		fetch: fetchMock,
		connect,
	});
	return { client, createCustomToken, fetchMock, socket, connect };
}

describe('IotClient', () => {
	let client: IotClient | undefined;
	afterEach(() => client?.close());

	it('exchanges a custom token for an ID token once and caches it', async () => {
		const s = setup();
		client = s.client;
		expect(await client.getIdToken()).toBe('id-token');
		expect(await client.getIdToken()).toBe('id-token');
		expect(s.createCustomToken).toHaveBeenCalledTimes(1);
		expect(s.createCustomToken).toHaveBeenCalledWith('admin');
		expect(String(s.fetchMock.mock.calls[0]?.[0])).toContain('key=KEY');
	});

	it('fails clearly when sign-in returns no token', async () => {
		const s = setup();
		client = s.client;
		s.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'INVALID' } })));
		await expect(client.getIdToken('someone')).rejects.toThrow(/someone/);
	});

	it('calls iot_socket functions with the admin token', async () => {
		const s = setup();
		client = s.client;
		const result = await client.lockAccount('u1', 60, 'spam');
		expect(result).toEqual({ message: 'done' });
		expect(s.connect).toHaveBeenCalledWith('https://socket.example', expect.objectContaining({ auth: { token: 'id-token' } }));
		expect(s.socket.emit).toHaveBeenCalledWith(
			'function',
			'accountBlockAccount',
			{ uid: 'u1', minutes: 60, reason: 'spam' },
			expect.any(Function),
		);
	});

	it('closes the previous socket before opening a new one', async () => {
		const s = setup();
		client = s.client;
		await client.updateSchools();
		await client.applyReviewer('u1');
		expect(s.socket.disconnect).toHaveBeenCalledTimes(1);
		expect(s.socket.emit).toHaveBeenLastCalledWith('function', 'accountApplyReviewer', { uid: 'u1' }, expect.any(Function));
	});
});
