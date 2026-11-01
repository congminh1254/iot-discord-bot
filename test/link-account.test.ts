import { describe, expect, it } from 'vitest';
import { rolesForUser } from '../src/discord/link-account.ts';

describe('rolesForUser', () => {
	it('grants permission, rank and plan roles in order', () => {
		expect(rolesForUser({ permission: 2, talent: { rank: 3 }, plan: 2 })).toEqual([
			'verified-player',
			'rank-gold',
			'elite+',
		]);
	});

	it('maps staff permissions', () => {
		expect(rolesForUser({ permission: 10 })).toEqual(['admin']);
		expect(rolesForUser({ permission: 5 })).toEqual(['moderator']);
	});

	it('grants nothing to banned or unreviewed accounts', () => {
		expect(rolesForUser({ permission: 0 })).toEqual([]);
		expect(rolesForUser({ permission: 1, plan: 0 })).toEqual([]);
	});

	it('handles the rookie rank (0)', () => {
		expect(rolesForUser({ talent: { rank: 0 } })).toEqual(['rank-rookie']);
	});
});
