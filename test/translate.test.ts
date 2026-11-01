import { describe, expect, it } from 'vitest';
import { translateOptions } from '../src/translate.ts';

const key = {
	project_id: 'p',
	client_email: 'bot@p.iam.gserviceaccount.com',
	private_key: 'k',
};

describe('translateOptions', () => {
	it('uses Application Default Credentials when the key file exists', () => {
		expect(translateOptions(key, './cert.json', () => true)).toEqual({});
	});

	it('falls back to the Firebase service account when the key file is missing', () => {
		expect(translateOptions(key, './cert.json', () => false)).toEqual({
			projectId: 'p',
			credentials: {
				client_email: 'bot@p.iam.gserviceaccount.com',
				private_key: 'k',
			},
		});
	});

	it('uses the Firebase service account when no key file is configured', () => {
		expect(translateOptions(key, undefined)).toMatchObject({ projectId: 'p' });
	});
});
