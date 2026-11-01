import { existsSync } from 'node:fs';
import type { v2 as translateV2 } from '@google-cloud/translate';

/** The parts of a Google service account key that Translate needs. */
export interface ServiceAccountKey {
	project_id?: string;
	client_email?: string;
	private_key?: string;
}

/**
 * Chooses credentials for Google Cloud Translate. A readable
 * GOOGLE_APPLICATION_CREDENTIALS file wins (Application Default Credentials);
 * otherwise the Firebase service account from FIREBASE_SERVICE_ACCOUNT is used,
 * so the bot works without a key file on disk.
 */
export function translateOptions(
	serviceAccount: ServiceAccountKey,
	credentialsPath: string | undefined,
	fileExists: (path: string) => boolean = existsSync,
): ConstructorParameters<typeof translateV2.Translate>[0] {
	if (credentialsPath && fileExists(credentialsPath)) return {};
	if (credentialsPath) {
		console.warn(
			`GOOGLE_APPLICATION_CREDENTIALS points to a missing file (${credentialsPath}); using FIREBASE_SERVICE_ACCOUNT for Translate.`,
		);
	}
	return {
		projectId: serviceAccount.project_id,
		credentials: {
			client_email: serviceAccount.client_email,
			private_key: serviceAccount.private_key,
		},
	};
}
