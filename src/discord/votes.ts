/**
 * Pure state machine behind the report vote buttons (`reportignore_*`, `reportblock_*`).
 *
 * The vote state lives on the Discord message itself: each button's custom id carries
 * the comma-separated indexes of its voters, and the embed's "Biểu quyết" field lists
 * voter mentions in vote order.
 */

export const VOTES_FIELD = 'Biểu quyết';
export const DECISION_FIELD = 'Quyết định';
export const STATUS_FIELD = 'Trạng thái';
/** Votes on one option needed to close the vote (an admin's single vote also closes it). */
export const VOTES_TO_DECIDE = 5;

export interface VoteButton {
	customId: string;
	label: string;
	disabled?: boolean;
}

export interface VoteField {
	name: string;
	value: string;
	inline?: boolean;
}

export interface VoteState {
	buttons: VoteButton[];
	fields: VoteField[];
}

export type VoteOutcome =
	| { kind: 'duplicate' }
	| {
			kind: 'voted';
			state: VoteState;
			/** Label of the option that was voted for. */
			optionLabel: string;
			/** Mentions of everyone who voted for this option, in vote order. */
			optionVoters: string[];
	  };

function voterMentions(fields: readonly VoteField[]): string[] {
	const field = fields.find((f) => f.name === VOTES_FIELD);
	return field ? field.value.trim().split(' ').filter((s) => s.trim() !== '') : [];
}

/**
 * Records `voterId`'s vote for the button `clickedCustomId`.
 * `voteSegment` is the position in the `_`-separated custom id that holds the voter indexes.
 */
export function applyVote(state: VoteState, clickedCustomId: string, voterId: string, voteSegment: number): VoteOutcome {
	const mention = `<@${voterId}>`;
	const voters = voterMentions(state.fields);
	if (voters.includes(mention)) return { kind: 'duplicate' };

	const newVoterIndex = voters.length;
	let optionLabel = '';
	let optionVoterIndexes: string[] = [];
	const buttons = state.buttons.map((button) => {
		if (button.customId !== clickedCustomId) return { ...button };
		const parts = button.customId.split('_');
		const separator = parts.length <= voteSegment ? '_' : ',';
		const customId = `${button.customId}${separator}${newVoterIndex}`;
		optionVoterIndexes = (customId.split('_')[voteSegment] ?? '').split(',');
		optionLabel = (button.label.split('(')[0] ?? '').trim();
		return { ...button, customId, label: `${optionLabel} (${optionVoterIndexes.length} phiếu)` };
	});

	const allVoters = [...voters, mention];
	const fields = state.fields.map((f) => ({ ...f }));
	const votesField = fields.find((f) => f.name === VOTES_FIELD);
	if (votesField) votesField.value += ` ${mention}`;
	else fields.push({ name: VOTES_FIELD, value: ` ${mention}` });

	return {
		kind: 'voted',
		state: { buttons, fields },
		optionLabel,
		optionVoters: optionVoterIndexes.map((i) => allVoters[Number(i)] ?? '').filter(Boolean),
	};
}

export function isDecided(optionVoters: readonly string[], voterIsAdmin: boolean): boolean {
	return voterIsAdmin || optionVoters.length >= VOTES_TO_DECIDE;
}

/** Closes the vote: disables every button, replaces the running tally with the decision and a status. */
export function closeVote(state: VoteState, optionVoters: readonly string[], status: string): VoteState {
	return {
		buttons: state.buttons.map((b) => ({ ...b, disabled: true })),
		fields: [
			...state.fields.filter((f) => f.name !== VOTES_FIELD),
			{ name: DECISION_FIELD, value: `${optionVoters.join(' ')} ` },
			{ name: STATUS_FIELD, value: status },
		],
	};
}
