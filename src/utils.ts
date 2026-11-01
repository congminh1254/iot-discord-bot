/** Pure helpers shared across the bot. Nothing here touches Discord or Firebase. */

export const Permission = {
	ADMINISTRATOR: 10,
	MODERATOR: 5,
	PLAYER: 2,
	WAITFORREVIEW: 1,
	BANNED: 0,
} as const;

const PERMISSION_NAMES: Record<number, string> = {
	10: 'Administrator',
	5: 'Moderator',
	2: 'Player',
	1: 'WaitingForReview',
	0: 'Banned',
};

/** Returns the display name of an IOT permission level, or undefined if unknown. */
export function permissionName(permission: number | null | undefined): string | undefined {
	if (permission === null || permission === undefined) return undefined;
	return PERMISSION_NAMES[permission];
}

export const ActionResultCode = {
	ACTION_SUCCESS: 1,
	ACTION_ERROR: 0,
} as const;

export function pad(number: number | string, size = 2): string {
	return String(number).padStart(size, '0');
}

const ID_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function makeid(length: number, random: () => number = Math.random): string {
	let result = '';
	for (let i = 0; i < length; i++) {
		result += ID_CHARACTERS.charAt(Math.floor(random() * ID_CHARACTERS.length));
	}
	return result;
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((item, i) => item.trim() === b[i]?.trim());
}

/**
 * Checks a player's answer against the accepted answers.
 *
 * An accepted answer matches when it is equal (case-insensitive), when it is an
 * ordered list separated by `~>` and the player's comma-separated list matches in
 * order, or when it is an unordered list separated by `~+` and the player's list
 * holds the same items in any order.
 */
export function checkAnswer(text: string, answers: readonly string[]): boolean {
	const normalized = text.trim().toUpperCase();
	for (const answer of answers) {
		const accepted = answer.trim().toUpperCase();
		if (normalized === accepted) return true;

		const given = normalized.split(',');
		if (sameItems(given, accepted.replace(/~>/g, '⨝').split('⨝'))) return true;

		const unorderedAccepted = accepted.replace(/~\+/g, '⨝').split('⨝').map((s) => s.trim()).sort();
		const unorderedGiven = given.map((s) => s.trim()).sort();
		if (sameItems(unorderedGiven, unorderedAccepted)) return true;
	}
	return false;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[items[i], items[j]] = [items[j] as T, items[i] as T];
	}
	return items;
}

export interface RankGrade {
	rank?: number | null;
	grade?: number | null;
	point?: number | null;
}

const RANK_NAMES = ['Tân Binh', 'Đồng', 'Bạc', 'Vàng', 'Bạch Kim', 'Kim Cương', 'Cao Thủ', 'Thách Đấu'];
const GRADE_NAMES: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

/** Discord role names (and CSS classes) for each IOT rank, indexed by rank. */
export const RANK_ROLE_NAMES = [
	'rank-rookie',
	'rank-bronze',
	'rank-silver',
	'rank-gold',
	'rank-platinum',
	'rank-diamond',
	'rank-crown',
	'rank-ace',
] as const;

export function getRankName(rank: number): string {
	return RANK_NAMES[rank] ?? '';
}

export function getGrade(grade: number): string {
	return GRADE_NAMES[grade] ?? '';
}

export function getRankClass(rank: RankGrade | null | undefined): string {
	if (!rank || rank.rank === null || rank.rank === undefined) return '';
	return RANK_ROLE_NAMES[rank.rank] ?? '';
}

export function getRankGradeName(rg: RankGrade | null | undefined): string {
	if (rg?.rank !== null && rg?.rank !== undefined && rg.grade !== null && rg.grade !== undefined) {
		if (rg.rank < 7) return `${getRankName(rg.rank)} ${getGrade(rg.grade)}`;
		return getRankName(rg.rank);
	}
	console.log(`Error -> getRankGradeName -> ${JSON.stringify(rg)}`);
	return '';
}

export function upcaseFirst(str: string | null | undefined): string {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error('pickRandom called with an empty list');
	return item;
}

/** Formats an uptime in seconds the way the `/server` command shows it, e.g. `2 days 03:04:05s`. */
export function formatUptime(uptimeSeconds: number): string {
	const total = Math.floor(uptimeSeconds);
	const days = Math.floor(total / 86400);
	const rest = total % 86400;
	const hms = `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
	return `${days > 0 ? `${days} days ` : ''}${hms}s`;
}

/** Splits a text command such as `/acc someone` into its lower-cased name and the raw argument text. */
export function parseTextCommand(content: string): { name: string; args: string } {
	const name = (content.split(' ')[0] ?? '').trim().toLowerCase();
	return { name, args: content.slice(name.length).trim() };
}
