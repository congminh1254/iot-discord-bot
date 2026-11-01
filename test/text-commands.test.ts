import { describe, expect, it } from 'vitest';
import { describeRelatedAccounts, EMOJI_PATTERN, isGreetingTrigger } from '../src/discord/text-commands.ts';
import { formatServerStatus } from '../src/discord/slash-commands.ts';
import type { IotUser } from '../src/types.ts';

describe('describeRelatedAccounts', () => {
	const users: Record<string, IotUser> = {
		a: { name: 'Self', username: 'self', permission: 2, school: { schoolName: 'S1' } },
		b: { name: 'Other', username: 'other', permission: 0, school: { schoolName: 'S2' } },
		c: { username: 'noname' },
	};

	it('lists other named accounts and skips the player', () => {
		expect(describeRelatedAccounts(users, 'self', () => true)).toBe('Other (other) - S2 - Banned\n');
	});

	it('can hide the school', () => {
		expect(describeRelatedAccounts(users, 'self', () => false)).toBe('Other (other) - Banned\n');
	});

	it('caps the list at 10 accounts', () => {
		const many = Object.fromEntries(
			Array.from({ length: 15 }, (_, i) => [`u${i}`, { name: `N${i}`, username: `u${i}`, permission: 2 }]),
		);
		expect(describeRelatedAccounts(many, 'nobody', () => false).trim().split('\n')).toHaveLength(10);
	});
});

describe('isGreetingTrigger', () => {
	it('triggers on baymax or a bot mention from humans only', () => {
		expect(isGreetingTrigger('hi BayMax', false, '1')).toBe(true);
		expect(isGreetingTrigger('hey <@1>', false, '1')).toBe(true);
		expect(isGreetingTrigger('hey <@!1>', false, '1')).toBe(true);
		expect(isGreetingTrigger('hello', false, '1')).toBe(false);
		expect(isGreetingTrigger('baymax', true, '1')).toBe(false);
	});
});

describe('EMOJI_PATTERN', () => {
	it('matches a single :emoji: message', () => {
		expect(EMOJI_PATTERN.test(':pepe_cry:')).toBe(true);
		expect(EMOJI_PATTERN.test('hello :pepe:')).toBe(false);
		expect(EMOJI_PATTERN.test(':two words:')).toBe(false);
	});
});

describe('formatServerStatus', () => {
	it('formats the iot_socket /stat payload', () => {
		expect(formatServerStatus({ online: 12, freemem: 512 * 1024 * 1024, totalmem: 2048 * 1024 * 1024, uptime: 90061 })).toBe(
			'IOT server status: \n- Online: 12 players. \n- Free memory: 512/2048MB\n- Uptime: 1 days 01:01:01s',
		);
	});
});
