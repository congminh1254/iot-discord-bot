const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

var guildId = process.env.DISCORD_GUILD_ID;
var clientId = process.env.DISCORD_APPLICATION_ID;
var token = process.env.DISCORD_BOT_KEY;

const commands = [
	new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
	new SlashCommandBuilder().setName('server').setDescription('Replies with server info!'),
	new SlashCommandBuilder().setName('user').setDescription('Replies with user info!'),
	new SlashCommandBuilder().setName('support').setDescription('Create a channel to get help from admin!'),
	new SlashCommandBuilder().setName('done').setDescription('Mark support case as finished!'),
	new SlashCommandBuilder().setName('update-role').setDescription('Sync role with IOT!'),
	new SlashCommandBuilder().setName('iot').setDescription('Get user profile on IOT - IMIN Olympia Training!').addUserOption(option => option.setName('user').setDescription('Player')),
]
	.map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);