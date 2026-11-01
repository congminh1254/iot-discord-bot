import { describe, expect, it } from 'vitest';
import {
	checkAnswer,
	formatUptime,
	getRankClass,
	getRankGradeName,
	makeid,
	pad,
	parseTextCommand,
	permissionName,
	pickRandom,
	shuffle,
	upcaseFirst,
} from '../src/utils.ts';

describe('checkAnswer', () => {
	it('matches exact answers ignoring case and surrounding spaces', () => {
		expect(checkAnswer('  hà nội ', ['Hà Nội'])).toBe(true);
		expect(checkAnswer('Huế', ['Hà Nội'])).toBe(false);
	});

	it('tries every accepted answer', () => {
		expect(checkAnswer('b', ['a', 'b'])).toBe(true);
		expect(checkAnswer('x', [])).toBe(false);
	});

	it('requires the same order for ~> answers', () => {
		expect(checkAnswer('a, b, c', ['A ~> B ~> C'])).toBe(true);
		expect(checkAnswer('c, b, a', ['A ~> B ~> C'])).toBe(false);
	});

	it('accepts any order for ~+ answers', () => {
		expect(checkAnswer('c, a, b', ['A ~+ B ~+ C'])).toBe(true);
		expect(checkAnswer('a, b', ['A ~+ B ~+ C'])).toBe(false);
	});
});

describe('ranks', () => {
	it('names rank and grade', () => {
		expect(getRankGradeName({ rank: 3, grade: 2 })).toBe('Vàng II');
		expect(getRankGradeName({ rank: 0, grade: 5 })).toBe('Tân Binh V');
	});

	it('omits the grade for the top rank', () => {
		expect(getRankGradeName({ rank: 7, grade: 1 })).toBe('Thách Đấu');
	});

	it('returns an empty name for incomplete data', () => {
		expect(getRankGradeName(undefined)).toBe('');
		expect(getRankGradeName({ rank: 2 })).toBe('');
	});

	it('maps rank to css class', () => {
		expect(getRankClass({ rank: 5 })).toBe('rank-diamond');
		expect(getRankClass(null)).toBe('');
		expect(getRankClass({ rank: 42 })).toBe('');
	});
});

describe('small helpers', () => {
	it('pads numbers', () => {
		expect(pad(7)).toBe('07');
		expect(pad(7, 3)).toBe('007');
		expect(pad(123)).toBe('123');
	});

	it('makes ids of the requested length from the alphabet', () => {
		const id = makeid(12);
		expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
		expect(makeid(3, () => 0)).toBe('AAA');
	});

	it('shuffles in place without losing items', () => {
		const items = [1, 2, 3, 4, 5];
		expect(shuffle(items).sort()).toEqual([1, 2, 3, 4, 5]);
	});

	it('names permissions', () => {
		expect(permissionName(10)).toBe('Administrator');
		expect(permissionName(0)).toBe('Banned');
		expect(permissionName(undefined)).toBeUndefined();
	});

	it('upper-cases the first letter', () => {
		expect(upcaseFirst('create')).toBe('Create');
		expect(upcaseFirst(undefined)).toBe('');
	});

	it('picks a random element and rejects empty lists', () => {
		expect(pickRandom(['a', 'b'], () => 0.99)).toBe('b');
		expect(() => pickRandom([])).toThrow();
	});

	it('formats uptime like the /server command', () => {
		expect(formatUptime(3725)).toBe('01:02:05s');
		expect(formatUptime(2 * 86400 + 61)).toBe('2 days 00:01:01s');
	});

	it('parses text commands', () => {
		expect(parseTextCommand('/acc  Some Player ')).toEqual({ name: '/acc', args: 'Some Player' });
		expect(parseTextCommand('/REVIEW a@b.c')).toEqual({ name: '/review', args: 'a@b.c' });
	});
});
