import { SnowflakeUtil } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { isInactive, isSupportChannel, lastActivityAt } from '../src/discord/support-cleanup.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 1);

describe('lastActivityAt', () => {
	it('uses the newest message time', () => {
		const lastMessageId = SnowflakeUtil.generate({ timestamp: now - 3 * DAY }).toString();
		expect(lastActivityAt({ lastMessageId, createdTimestamp: now - 30 * DAY })).toBe(now - 3 * DAY);
	});

	it('falls back to creation time for empty channels', () => {
		expect(lastActivityAt({ lastMessageId: null, createdTimestamp: now - 30 * DAY })).toBe(now - 30 * DAY);
	});
});

describe('isInactive', () => {
	it('is inactive only after more than 14 days', () => {
		expect(isInactive(now - 14 * DAY, now)).toBe(false);
		expect(isInactive(now - 14 * DAY - 1, now)).toBe(true);
		expect(isInactive(now - DAY, now)).toBe(false);
	});
});

describe('isSupportChannel', () => {
	it('matches case channels in the help category only', () => {
		expect(isSupportChannel({ name: 'case_123', parent: { name: 'Help Channels' } })).toBe(true);
		expect(isSupportChannel({ name: 'case_123', parent: { name: 'general' } })).toBe(false);
		expect(isSupportChannel({ name: 'general', parent: { name: 'help channels' } })).toBe(false);
		expect(isSupportChannel({ name: 'case_1', parent: null })).toBe(false);
	});
});
