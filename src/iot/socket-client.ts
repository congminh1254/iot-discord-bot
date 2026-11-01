import type { Auth } from 'firebase-admin/auth';
import { io, type Socket } from 'socket.io-client';
import type { IotFunctionResult, IotUser } from '../types.ts';

const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface IotClientOptions {
	auth: Auth;
	apiKey: string;
	socketUrl: string;
	defaultAdminUid: string;
	fetch?: typeof fetch;
	connect?: typeof io;
}

/**
 * Client for the `function` RPCs exposed by iot_socket. It signs in as the IOT admin
 * account with a Firebase custom token and calls functions over socket.io.
 */
export class IotClient {
	private readonly options: IotClientOptions;
	private readonly fetchImpl: typeof fetch;
	private readonly connect: typeof io;
	private idTokens = new Map<string, string>();
	private socket: Socket | null = null;
	private readonly tokenTimer: NodeJS.Timeout;

	constructor(options: IotClientOptions) {
		this.options = options;
		this.fetchImpl = options.fetch ?? fetch;
		this.connect = options.connect ?? io;
		this.tokenTimer = setInterval(() => this.idTokens.clear(), TOKEN_TTL_MS);
		this.tokenTimer.unref();
	}

	async getIdToken(uid = this.options.defaultAdminUid): Promise<string> {
		const cached = this.idTokens.get(uid);
		if (cached) return cached;
		const customToken = await this.options.auth.createCustomToken(uid);
		const response = await this.fetchImpl(
			`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${this.options.apiKey}`,
			{
				method: 'POST',
				body: JSON.stringify({ token: customToken, returnSecureToken: true }),
				headers: { 'Content-Type': 'application/json' },
			},
		);
		const result = (await response.json()) as { idToken?: string };
		if (!result.idToken) throw new Error(`Could not sign in to IOT as ${uid}`);
		this.idTokens.set(uid, result.idToken);
		return result.idToken;
	}

	/** Opens a fresh socket with a current token, closing the previous one. */
	async getSocket(): Promise<Socket> {
		try {
			if (this.socket?.connected) this.socket.disconnect();
		} catch (err) {
			console.log(err);
		}
		const token = await this.getIdToken();
		const socket = this.connect(this.options.socketUrl, {
			reconnectionDelay: 1000,
			reconnectionAttempts: Infinity,
			auth: { token },
			query: { location: '/discord' },
		});
		socket.on('connect', () => console.log('Connected to IOT server'));
		socket.on('disconnect', () => console.log('Disconnected from IOT server'));
		socket.on('error', (error: unknown) => console.log(`Error from IOT server: ${String(error)}`));
		this.socket = socket;
		return socket;
	}

	async call<T = unknown>(name: string, payload: Record<string, unknown> = {}): Promise<IotFunctionResult<T>> {
		const socket = await this.getSocket();
		return new Promise((resolve) => {
			socket.emit('function', name, payload, (result: IotFunctionResult<T>) => resolve(result));
		});
	}

	deleteAccount(uid: string) {
		return this.call('accountDeleteAccount', { uid });
	}

	lockAccount(uid: string, minutes: number, reason: string) {
		return this.call('accountBlockAccount', { uid, minutes, reason });
	}

	unlockAccount(uid: string) {
		return this.call('accountUnblockAccount', { uid });
	}

	approveAccount(uid: string, reviewer: string | null = null) {
		return this.call('accountApproveAccount', { uid, reviewer });
	}

	rejectAccount(uid: string, reviewer: string | null = null) {
		return this.call('accountRejectAccount', { uid, reviewer });
	}

	getAccountsToReview() {
		return this.call<IotUser[]>('accountGetUsersReview');
	}

	applyReviewer(uid: string) {
		return this.call('accountApplyReviewer', { uid });
	}

	resignReviewer(uid: string) {
		return this.call('accountResignReviewer', { uid });
	}

	updateSchools() {
		return this.call('manageUpdateSchools');
	}

	close(): void {
		clearInterval(this.tokenTimer);
		this.socket?.disconnect();
	}
}

export interface IpData {
	country?: string;
	as?: string;
}

export async function getIpData(ip: string, fetchImpl: typeof fetch = fetch): Promise<IpData> {
	const response = await fetchImpl(`http://ip-api.com/json/${encodeURIComponent(ip)}`);
	return (await response.json()) as IpData;
}
