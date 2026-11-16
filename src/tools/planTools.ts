import { parsePlanSteps } from '../utils/planSteps';

/**
 * The agent's own checklist for long tasks. It changes nothing in the novel: the
 * chat draws it as a checklist so the author sees where the work stands, and the
 * answer repeats it so the model keeps track across rounds.
 */
export async function updatePlan(args: Record<string, string>): Promise<string> {
	const steps = parsePlanSteps(args.steps ?? '');
	if (!steps.length) {
		throw new Error('Write one step per line, each starting with [x] done, [>] in progress or [ ] pending.');
	}
	const done = steps.filter((step) => step.status === 'done').length;
	const active = steps.find((step) => step.status === 'active');
	const next = active ?? steps.find((step) => step.status === 'pending');
	const status = done === steps.length
		? 'All steps done.'
		: `Next: ${next?.text ?? '(none)'}`;
	return `Plan updated: ${done}/${steps.length} done. ${status}`;
}
