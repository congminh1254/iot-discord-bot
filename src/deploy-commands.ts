import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './discord/command-definitions.ts';
import { loadDotEnv } from './env.ts';

loadDotEnv();

const { DISCORD_GUILD_ID: guildId, DISCORD_APPLICATION_ID: clientId, DISCORD_BOT_KEY: token } = process.env;
if (!guildId || !clientId || !token) {
	console.error('DISCORD_GUILD_ID, DISCORD_APPLICATION_ID and DISCORD_BOT_KEY must be set.');
	process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

try {
	await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
		body: commandDefinitions.map((command) => command.toJSON()),
	});
	console.log('Successfully registered application commands.');
} catch (err) {
	console.error(err);
	process.exitCode = 1;
}
