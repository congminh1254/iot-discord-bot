import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
	new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
	new SlashCommandBuilder().setName('server').setDescription('Replies with server info!'),
	new SlashCommandBuilder().setName('user').setDescription('Replies with user info!'),
	new SlashCommandBuilder().setName('support').setDescription('Create a channel to get help from admin!'),
	new SlashCommandBuilder().setName('done').setDescription('Mark support case as finished!'),
	new SlashCommandBuilder().setName('update-role').setDescription('Sync role with IOT!'),
	new SlashCommandBuilder()
		.setName('iot')
		.setDescription('Get user profile on IOT - IMIN Olympia Training!')
		.addUserOption((option) => option.setName('user').setDescription('Player')),
];

export type CommandName =
	| 'ping'
	| 'server'
	| 'user'
	| 'support'
	| 'done'
	| 'update-role'
	| 'iot';
