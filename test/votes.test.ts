import { describe, expect, it } from 'vitest';
import { applyVote, closeVote, isDecided, VOTES_FIELD, type VoteState } from '../src/discord/votes.ts';

const initial: VoteState = {
	buttons: [
		{ customId: 'reportignore_r1', label: 'Bỏ qua' },
		{ customId: 'reportblock_u1_60', label: 'Khóa 1 giờ' },
	],
	fields: [
		{ name: 'Người báo cáo', value: 'a' },
		{ name: 'Người bị báo cáo', value: 'b' },
		{ name: 'Lý do', value: 'spam' },
	],
};

function vote(state: VoteState, customId: string, voter: string, segment: number) {
	const outcome = applyVote(state, customId, voter, segment);
	if (outcome.kind !== 'voted') throw new Error('expected a vote');
	return outcome;
}

describe('applyVote', () => {
	it('records the first vote on the button and in the tally field', () => {
		const out = vote(initial, 'reportignore_r1', '111', 2);
		expect(out.state.buttons[0]).toMatchObject({ customId: 'reportignore_r1_0', label: 'Bỏ qua (1 phiếu)' });
		expect(out.state.buttons[1]).toEqual(initial.buttons[1]);
		expect(out.state.fields.at(-1)).toEqual({ name: VOTES_FIELD, value: ' <@111>' });
		expect(out.optionLabel).toBe('Bỏ qua');
		expect(out.optionVoters).toEqual(['<@111>']);
	});

	it('does not mutate the input state', () => {
		const copy = structuredClone(initial);
		vote(initial, 'reportignore_r1', '111', 2);
		expect(initial).toEqual(copy);
	});

	it('appends later votes and tracks voters per option', () => {
		let state = vote(initial, 'reportignore_r1', '111', 2).state;
		state = vote(state, 'reportblock_u1_60', '222', 3).state;
		const out = vote(state, 'reportignore_r1_0', '333', 2);
		expect(out.state.buttons[0]).toMatchObject({ customId: 'reportignore_r1_0,2', label: 'Bỏ qua (2 phiếu)' });
		expect(out.state.buttons[1]).toMatchObject({ customId: 'reportblock_u1_60_1', label: 'Khóa 1 giờ (1 phiếu)' });
		expect(out.optionVoters).toEqual(['<@111>', '<@333>']);
	});

	it('ignores a second vote from the same person', () => {
		const state = vote(initial, 'reportignore_r1', '111', 2).state;
		expect(applyVote(state, 'reportblock_u1_60', '111', 3)).toEqual({ kind: 'duplicate' });
	});
});

describe('closing a vote', () => {
	it('is decided by five votes or by one admin', () => {
		expect(isDecided(['1', '2', '3', '4'], false)).toBe(false);
		expect(isDecided(['1', '2', '3', '4', '5'], false)).toBe(true);
		expect(isDecided(['1'], true)).toBe(true);
	});

	it('disables buttons and replaces the tally with the decision', () => {
		const out = vote(initial, 'reportignore_r1', '111', 2);
		const closed = closeVote(out.state, out.optionVoters, 'Báo cáo được bỏ qua.');
		expect(closed.buttons.every((b) => b.disabled)).toBe(true);
		expect(closed.fields.map((f) => f.name)).toEqual(['Người báo cáo', 'Người bị báo cáo', 'Lý do', 'Quyết định', 'Trạng thái']);
		expect(closed.fields.at(-2)?.value).toBe('<@111> ');
		expect(closed.fields.at(-1)?.value).toBe('Báo cáo được bỏ qua.');
	});
});
