/**
 * Steps of the plan the chat agent keeps with `update_plan`. Pure: the tool
 * parses them to answer the model, and the chat card to draw the checklist.
 *
 * One step per line, with a box in front:
 *   [x] done   [>] in progress   [ ] pending
 * Bullets and numbers before the box are ignored; a line without a box is pending.
 */

export type PlanStepStatus = 'done' | 'active' | 'pending';

export interface PlanStep {
	status: PlanStepStatus;
	text: string;
}

const BOX = /^\s*(?:[-*+]|\d+[.)])?\s*\[\s*([xX✓>~\-*]?)\s*\]\s*(.*)$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;

function statusOf(mark: string): PlanStepStatus {
	if (/^[xX✓]$/.test(mark)) return 'done';
	if (/^[>~\-*]$/.test(mark)) return 'active';
	return 'pending';
}

export function parsePlanSteps(text: string): PlanStep[] {
	const steps: PlanStep[] = [];
	for (const line of (text ?? '').split('\n')) {
		if (!line.trim()) continue;
		const boxed = line.match(BOX);
		if (boxed) {
			const content = boxed[2].trim();
			if (content) steps.push({ status: statusOf(boxed[1]), text: content });
			continue;
		}
		const content = line.replace(BULLET, '').trim();
		if (content) steps.push({ status: 'pending', text: content });
	}
	return steps;
}
