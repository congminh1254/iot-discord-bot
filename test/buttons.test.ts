import { ButtonStyle, ComponentType, type Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { readVoteState } from '../src/discord/buttons.ts';

describe('readVoteState', () => {
	it('reads buttons and embed fields from a report message', () => {
		const message = {
			components: [
				{
					type: ComponentType.ActionRow,
					components: [
						{ type: ComponentType.Button, customId: 'reportignore_r1', label: 'Bỏ qua', style: ButtonStyle.Secondary, disabled: false },
						{ type: ComponentType.Button, customId: 'reportblock_u_60', label: 'Khóa', style: ButtonStyle.Danger, disabled: false },
					],
				},
			],
			embeds: [{ fields: [{ name: 'Lý do', value: 'spam', inline: false }] }],
		} as unknown as Pick<Message, 'components' | 'embeds'>;
		const { state, buttonStyles } = readVoteState(message);
		expect(state.buttons.map((b) => b.customId)).toEqual(['reportignore_r1', 'reportblock_u_60']);
		expect(buttonStyles).toEqual([ButtonStyle.Secondary, ButtonStyle.Danger]);
		expect(state.fields).toEqual([{ name: 'Lý do', value: 'spam', inline: false }]);
	});

	it('returns empty state for a message without components', () => {
		const { state } = readVoteState({ components: [], embeds: [] });
		expect(state).toEqual({ buttons: [], fields: [] });
	});
});
