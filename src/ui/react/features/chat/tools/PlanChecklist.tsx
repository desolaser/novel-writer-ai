import { parsePlanSteps, type PlanStepStatus } from '../../../../../utils/planSteps';

/** The agent's plan (`update_plan`) drawn as a checklist inside its tool card. */

const MARK: Record<PlanStepStatus, string> = {
	done: '✓',
	active: '▸',
	pending: '○',
};

export function PlanChecklist({ steps }: { steps: string }) {
	const items = parsePlanSteps(steps);
	if (!items.length) return null;
	return (
		<ul className="nw-plan-checklist">
			{items.map((step, index) => (
				<li key={index} className={`nw-plan-step nw-plan-step-${step.status}`}>
					<span className="nw-plan-step-mark">{MARK[step.status]}</span>
					<span className="nw-plan-step-text">{step.text}</span>
				</li>
			))}
		</ul>
	);
}
