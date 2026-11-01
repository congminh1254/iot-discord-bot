import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	type ButtonInteraction,
	type GuildMember,
	type Message,
} from 'discord.js';
import type { BotContext } from '../context.ts';
import { getIotUidFromDiscordId } from '../firebase.ts';
import { deleteAccount, lockAccount, unlockAccount } from './account-actions.ts';
import { hasAnyRole } from './slash-commands.ts';
import { applyVote, closeVote, isDecided, type VoteButton, type VoteState } from './votes.ts';

const VOTER_ROLES = ['admin', 'moderator', 'verified-player'];

/** Reads the first row of buttons and the first embed of a report message into plain vote state. */
export function readVoteState(message: Pick<Message, 'components' | 'embeds'>): { state: VoteState; buttonStyles: ButtonStyle[] } {
	const row = message.components[0];
	const buttons: VoteButton[] = [];
	const buttonStyles: ButtonStyle[] = [];
	if (row?.type === ComponentType.ActionRow) {
		for (const component of row.components) {
			if (component.type === ComponentType.Button && component.customId) {
				buttons.push({ customId: component.customId, label: component.label ?? '', disabled: component.disabled });
				buttonStyles.push(component.style);
			}
		}
	}
	const fields = (message.embeds[0]?.fields ?? []).map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
	return { state: { buttons, fields }, buttonStyles };
}

function buildVoteMessage(message: Message, state: VoteState, buttonStyles: ButtonStyle[]) {
	const embed = EmbedBuilder.from(message.embeds[0] ?? {}).setFields(state.fields);
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		state.buttons.map((b, i) =>
			new ButtonBuilder()
				.setCustomId(b.customId)
				.setLabel(b.label)
				.setStyle(buttonStyles[i] ?? ButtonStyle.Primary)
				.setDisabled(b.disabled ?? false),
		),
	);
	return { embeds: [embed], components: [row] };
}

/**
 * Handles a vote on a report. `voteSegment` is where the voter indexes sit in the custom id;
 * `decide` runs once the vote closes and returns the status text to show.
 */
async function handleReportVote(
	interaction: ButtonInteraction,
	voteSegment: number,
	decide: () => Promise<string>,
): Promise<void> {
	await interaction.deferReply();
	const voter: GuildMember | null = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null;
	const { state, buttonStyles } = readVoteState(interaction.message);
	const outcome = applyVote(state, interaction.customId, interaction.user.id, voteSegment);
	if (outcome.kind === 'duplicate') {
		await interaction.deleteReply();
		return;
	}
	if (!hasAnyRole(voter, VOTER_ROLES)) {
		await interaction.editReply('Bạn không có quyền thực hiện thao tác này!');
		return;
	}
	await interaction.message.edit({ ...buildVoteMessage(interaction.message, outcome.state, buttonStyles), attachments: [] });
	await interaction.editReply(`<@${interaction.user.id}> biểu quyết ${outcome.optionLabel}`);

	if (isDecided(outcome.optionVoters, hasAnyRole(voter, ['admin']))) {
		const status = await decide();
		const closed = closeVote(outcome.state, outcome.optionVoters, status);
		await interaction.message.edit({ ...buildVoteMessage(interaction.message, closed, buttonStyles), attachments: [] });
	}
}

async function handleReview(ctx: BotContext, interaction: ButtonInteraction, uid: string, approve: boolean) {
	await interaction.deferReply();
	const reviewer = await getIotUidFromDiscordId(ctx.database, interaction.user.id);
	const result = approve ? await ctx.iot.approveAccount(uid, reviewer) : await ctx.iot.rejectAccount(uid, reviewer);
	await interaction.editReply(`\`\`\`${result.message}\`\`\``);
	await interaction.message.delete();
}

export async function handleButton(ctx: BotContext, interaction: ButtonInteraction): Promise<void> {
	const params = interaction.customId.split('_');
	const [action, target = ''] = params;
	switch (action) {
		case 'approve':
			await handleReview(ctx, interaction, target, true);
			break;
		case 'reject':
			await handleReview(ctx, interaction, target, false);
			break;
		case 'lock':
			await interaction.deferReply();
			await lockAccount(ctx, interaction, target);
			break;
		case 'unlock':
			await interaction.deferReply();
			await unlockAccount(ctx, interaction, target);
			break;
		case 'delete':
			await interaction.deferReply();
			await deleteAccount(ctx, interaction, target);
			break;
		case 'reportignore':
			// reportignore_<id>_<voters>
			await handleReportVote(interaction, 2, () => Promise.resolve('Báo cáo được bỏ qua.'));
			break;
		case 'reportblock': {
			// reportblock_<uid>_<minutes>_<voters>; the third embed field holds the report reason.
			const reason = interaction.message.embeds[0]?.fields[2]?.value ?? '';
			const minutes = parseInt(params[2] ?? '', 10);
			await handleReportVote(interaction, 3, async () => (await ctx.iot.lockAccount(target, minutes, reason)).message);
			break;
		}
	}
}
