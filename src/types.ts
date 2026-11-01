import type { RankGrade } from './utils.ts';

/** Shape of `/private_users/{uid}` in the IOT Realtime Database (only the fields the bot reads). */
export interface IotUser {
	name?: string;
	username?: string;
	lower_username?: string;
	email?: string;
	permission?: number;
	talent?: RankGrade;
	birthday?: number;
	created_at?: number;
	block_time?: number | null;
	block_reason?: string;
	avatarUrl?: string;
	plan?: number;
	reviewer?: boolean;
	school?: {
		schoolId?: string;
		schoolName?: string;
		provinceName?: string;
	};
	ip?: { ip?: string; query?: string };
	discord?: { id?: string; username?: string };
}

export interface Tournament {
	tourLogo?: string;
	tourModecrator?: string[];
}

/** Result envelope returned by iot_socket `function` calls. */
export interface IotFunctionResult<T = unknown> {
	status?: number;
	message: string;
	data?: T;
}
