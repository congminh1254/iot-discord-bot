import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ejs from 'ejs';
import type { Database } from 'firebase-admin/database';
import moment from 'moment';
import puppeteer from 'puppeteer';
import { getUser } from '../firebase.ts';
import type { IotUser, Tournament } from '../types.ts';
import { getRankClass, getRankGradeName, permissionName } from '../utils.ts';

const TEMPLATE_URL = new URL('../../templates/msg-rank.html', import.meta.url);
const DEFAULT_AVATAR = 'https://iot.chinhphucvn.com/img/user-avatar.png';
const SYSTEM_CHROMIUM = '/usr/bin/chromium';

export interface ProfileCardParams {
	avatar: string;
	rank_name: string;
	rank_class: string;
	rank_point: number | null | undefined;
	name: string;
	username: string | undefined;
	school: string;
	account_time: number;
	account_time_unit: string;
	permission_name: string | undefined;
	permission: number | undefined;
	list_tournaments: string;
	banned: string;
}

/** Shortens long names to their last two words, as the card has limited width. */
export function shortenName(name: string): string {
	if (name.length <= 15) return name;
	const words = name.trim().split(' ');
	return words.slice(-2).join(' ');
}

/** Builds the template parameters for a player's profile card. */
export function buildProfileCardParams(
	user: IotUser,
	uid: string,
	tournaments: Record<string, Tournament>,
	now: moment.Moment = moment(),
): ProfileCardParams {
	let listTournaments = '';
	for (const tour of Object.values(tournaments)) {
		if (tour.tourModecrator?.includes(uid)) listTournaments += `<img class="icon-logo" src="${tour.tourLogo}"></img>`;
	}
	if (listTournaments.length < 5) listTournaments = permissionName(user.permission) ?? '';

	const created = moment.unix(user.created_at ?? Math.floor(now.valueOf() / 1000));
	const years = now.diff(created, 'years');
	const months = now.diff(created, 'months');
	const days = now.diff(created, 'days');
	const [accountTime, accountTimeUnit] = years ? [years, 'Năm'] : months ? [months, 'Tháng'] : [days, 'Ngày'];

	return {
		avatar: user.avatarUrl || DEFAULT_AVATAR,
		rank_name: getRankGradeName(user.talent),
		rank_class: getRankClass(user.talent),
		rank_point: user.talent?.point,
		name: shortenName(user.name ?? ''),
		username: user.username,
		school: `${user.school?.schoolName} - ${user.school?.provinceName}`,
		account_time: accountTime,
		account_time_unit: accountTimeUnit,
		permission_name: permissionName(user.permission),
		permission: user.permission,
		list_tournaments: listTournaments,
		banned: (user.permission ?? 0) < 1 || user.block_time ? 'banned' : '',
	};
}

export async function renderProfileHtml(params: ProfileCardParams): Promise<string> {
	const template = await readFile(TEMPLATE_URL, 'utf8');
	return ejs.render(template, { user: params });
}

/** Renders a player's profile card to a PNG with headless Chromium. */
export async function generateIotProfile(database: Database, uid: string): Promise<Buffer> {
	const user = await getUser(database, uid);
	if (!user) throw new Error(`IOT user ${uid} not found`);
	const tournaments = ((await database.ref('/tournaments/').once('value')).val() ?? {}) as Record<string, Tournament>;
	const html = await renderProfileHtml(buildProfileCardParams(user, uid, tournaments));

	// Prefer a system Chromium (the Docker image installs one); otherwise use Puppeteer's own download.
	const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined);
	const browser = await puppeteer.launch({
		headless: true,
		// System Chromium inside a container cannot use its sandbox.
		...(executablePath && { executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
	});
	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'load' });
		await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 });
		await page.setViewport({ width: 600, height: 200, deviceScaleFactor: 1 });
		const png = await page.screenshot({ type: 'png', fullPage: true, captureBeyondViewport: false });
		return Buffer.from(png);
	} finally {
		await browser.close();
	}
}
