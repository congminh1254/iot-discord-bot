import type { Client, GuildMember } from 'discord.js';
import type { Database } from 'firebase-admin/database';
import { findUsersBy } from '../firebase.ts';
import type { IotUser } from '../types.ts';
import { getRankGradeName, RANK_ROLE_NAMES } from '../utils.ts';
import { findSendableChannel } from './channels.ts';

const PERMISSION_ROLES: Record<number, string> = {
	10: 'admin',
	5: 'moderator',
	2: 'verified-player',
};

const PLAN_ROLES: Record<number, string> = {
	1: 'elite',
	2: 'elite+',
};

/** Discord role names an IOT account is entitled to, in the order they are granted. */
export function rolesForUser(user: IotUser): string[] {
	const roles: string[] = [];
	const permissionRole = user.permission === undefined ? undefined : PERMISSION_ROLES[user.permission];
	if (permissionRole) roles.push(permissionRole);
	const rank = user.talent?.rank;
	const rankRole = rank === null || rank === undefined ? undefined : RANK_ROLE_NAMES[rank];
	if (rankRole) roles.push(rankRole);
	const planRole = user.plan && user.plan > 0 ? PLAN_ROLES[user.plan] : undefined;
	if (planRole) roles.push(planRole);
	if (user.reviewer) roles.push('reviewer');
	return roles;
}

/** Resets a member's roles to match their linked IOT account, optionally greeting them in #general. */
export async function linkIotAccount(
	client: Client,
	database: Database,
	member: GuildMember,
	welcomeMessage = true,
): Promise<void> {
	await member.roles.remove(member.roles.cache).catch((err: unknown) => console.log(err));
	const users = Object.values(await findUsersBy(database, '/discord/id', member.id));
	const user = users[0];
	if (!user) return;
	for (const roleName of rolesForUser(user)) {
		const role = member.guild.roles.cache.find((r) => r.name === roleName);
		if (role) await member.roles.add(role);
		else console.log(`Role ${roleName} does not exist in guild ${member.guild.name}`);
	}
	if (welcomeMessage) {
		const channel = findSendableChannel(client, 'general');
		await channel?.send(
			`Chào mừng người chơi IOT ${user.username} (${getRankGradeName(user.talent)}) tham gia server ${member.toString()} :heart_eyes_cat:`,
		);
	}
}
