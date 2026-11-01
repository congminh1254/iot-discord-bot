import { cert, initializeApp, type App, type AppOptions, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { decodeBase64Json, type Env } from './env.ts';
import type { IotUser } from './types.ts';

/** Firebase web config (the same JSON the IOT web client uses). */
export interface FirebaseWebConfig extends Record<string, unknown> {
	apiKey: string;
	databaseURL?: string;
	projectId?: string;
}

export interface FirebaseContext {
	app: App;
	auth: Auth;
	database: Database;
	webConfig: FirebaseWebConfig;
}

export function initFirebase(env: Env): FirebaseContext {
	const webConfig = decodeBase64Json<FirebaseWebConfig>(env.FIREBASE_CONFIG, 'FIREBASE_CONFIG');
	const serviceAccount = decodeBase64Json<ServiceAccount>(env.FIREBASE_SERVICE_ACCOUNT, 'FIREBASE_SERVICE_ACCOUNT');
	// The credential is built in memory: the service account key is never written to disk.
	const options: AppOptions = { ...webConfig, credential: cert(serviceAccount) };
	const app = initializeApp(options);
	return { app, auth: getAuth(app), database: getDatabase(app), webConfig };
}

/** Finds the first user whose `field` equals `value` exactly. */
export async function findUsersBy(database: Database, field: string, value: string): Promise<Record<string, IotUser>> {
	const snap = await database.ref('/private_users/').orderByChild(field).startAt(value).endAt(value).once('value');
	return (snap.val() as Record<string, IotUser> | null) ?? {};
}

export async function getUser(database: Database, uid: string): Promise<IotUser | null> {
	return (await database.ref(`/private_users/${uid}/`).once('value')).val() as IotUser | null;
}

export async function getIotUidFromDiscordId(database: Database, discordId: string): Promise<string | null> {
	const users = await findUsersBy(database, '/discord/id', discordId);
	return Object.keys(users)[0] ?? null;
}

/**
 * Looks a player up the way the `/acc` and `/review` text commands do: by username,
 * then email, then exact full name, then Firebase Auth email.
 */
export async function lookupPlayer(
	ctx: Pick<FirebaseContext, 'auth' | 'database'>,
	query: string,
): Promise<{ uid: string; user: IotUser } | null> {
	const lower = query.trim().toLowerCase();
	const raw = query.trim();
	let data: Record<string, IotUser | null> = await findUsersBy(ctx.database, 'lower_username', lower);
	if (Object.keys(data).length === 0) data = await findUsersBy(ctx.database, 'email', lower);
	if (Object.keys(data).length === 0) data = await findUsersBy(ctx.database, 'name', raw);
	if (Object.keys(data).length === 0) {
		try {
			const authUser = await ctx.auth.getUserByEmail(lower);
			data = { [authUser.uid]: await getUser(ctx.database, authUser.uid) };
		} catch (err) {
			console.log(err);
		}
	}
	const uid = Object.keys(data)[0];
	const user = uid ? data[uid] : null;
	return uid && user ? { uid, user } : null;
}
