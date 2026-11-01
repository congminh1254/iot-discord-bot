import moment from 'moment';
import { describe, expect, it } from 'vitest';
import { buildProfileCardParams, renderProfileHtml, shortenName } from '../src/discord/profile-card.ts';
import type { IotUser } from '../src/types.ts';

const now = moment.unix(1_800_000_000);
const user: IotUser = {
	name: 'Nguyễn Văn An',
	username: 'an',
	permission: 2,
	talent: { rank: 4, grade: 1, point: 1234 },
	school: { schoolName: 'THPT A', provinceName: 'Hà Nội' },
	created_at: now.clone().subtract(3, 'months').unix(),
};

describe('buildProfileCardParams', () => {
	it('fills the card fields', () => {
		const params = buildProfileCardParams(user, 'uid1', {}, now);
		expect(params).toMatchObject({
			name: 'Nguyễn Văn An',
			rank_name: 'Bạch Kim I',
			rank_class: 'rank-platinum',
			rank_point: 1234,
			school: 'THPT A - Hà Nội',
			permission_name: 'Player',
			list_tournaments: 'Player',
			account_time: 3,
			account_time_unit: 'Tháng',
			banned: '',
			avatar: 'https://iot.chinhphucvn.com/img/user-avatar.png',
		});
	});

	it('shows tournament logos for moderators of a tournament', () => {
		const params = buildProfileCardParams(user, 'uid1', { t: { tourLogo: 'logo.png', tourModecrator: ['uid1'] } }, now);
		expect(params.list_tournaments).toBe('<img class="icon-logo" src="logo.png"></img>');
	});

	it('marks banned and locked accounts', () => {
		expect(buildProfileCardParams({ ...user, permission: 0 }, 'u', {}, now).banned).toBe('banned');
		expect(buildProfileCardParams({ ...user, block_time: 1 }, 'u', {}, now).banned).toBe('banned');
	});

	it('uses years and days for account age', () => {
		const old = { ...user, created_at: now.clone().subtract(2, 'years').unix() };
		expect(buildProfileCardParams(old, 'u', {}, now)).toMatchObject({ account_time: 2, account_time_unit: 'Năm' });
		const fresh = { ...user, created_at: now.clone().subtract(5, 'days').unix() };
		expect(buildProfileCardParams(fresh, 'u', {}, now)).toMatchObject({ account_time: 5, account_time_unit: 'Ngày' });
	});
});

describe('shortenName', () => {
	it('keeps short names and trims long ones to the last two words', () => {
		expect(shortenName('Trần An')).toBe('Trần An');
		expect(shortenName('Nguyễn Thị Minh Khai Hoa')).toBe('Khai Hoa');
	});
});

describe('renderProfileHtml', () => {
	it('renders the template with escaped user values', async () => {
		const html = await renderProfileHtml(buildProfileCardParams({ ...user, username: '<b>x</b>' }, 'u', {}, now));
		expect(html).toContain('Bạch Kim I');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
		expect(html).not.toContain('<%');
	});
});
