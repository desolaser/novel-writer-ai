import type { TimelineLaneMode } from "../../../../types/StoryTimeline";
import { Icon } from "../../components/Icon";

const LANE_MODES: { id: TimelineLaneMode; label: string }[] = [
	{ id: "pov", label: "Point of view" },
	{ id: "setting", label: "Setting" },
	{ id: "characters", label: "Characters named" },
	{ id: "none", label: "No lanes" },
];

export interface TimelineToolbarProps {
	mode: TimelineLaneMode;
	dated: number;
	total: number;
	loading: boolean;
	onModeChange: (mode: TimelineLaneMode) => void;
	onRefresh: () => void;
}

/** Lane choice, how many chapters are placed, and a recount for mentions. */
export function TimelineToolbar({
	mode,
	dated,
	total,
	loading,
	onModeChange,
	onRefresh,
}: TimelineToolbarProps) {
	return (
		<div className="nw-timeline-toolbar">
			<label className="nw-timeline-lanes">
				<span>Lanes</span>
				<select
					className="dropdown"
					value={mode}
					onChange={(event) => onModeChange(event.target.value as TimelineLaneMode)}
				>
					{LANE_MODES.map((item) => (
						<option key={item.id} value={item.id}>
							{item.label}
						</option>
					))}
				</select>
			</label>
			<span className="nw-timeline-hint">
				{dated} of {total} chapters have a day · ↶ flashback
			</span>
			{mode === "characters" && (
				<button
					className="nw-btn nw-btn-icon"
					disabled={loading}
					title="Read the manuscripts again for who is named"
					aria-label="Recount mentions"
					onClick={onRefresh}
				>
					<Icon.Refresh width={12} height={12} />
				</button>
			)}
		</div>
	);
}
