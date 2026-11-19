import type { ChapterStatus } from "../../../domain";
import { chapterStatusInfo } from "../../../constants/chapterStatus";

/** Colored dot with the chapter's writing stage; hollow when it has none. */
export function ChapterStatusDot({ status }: { status?: ChapterStatus }) {
	const info = chapterStatusInfo(status);
	const title = info
		? `Status: ${info.label} (${info.hint.toLowerCase()})`
		: "Status: not set";
	return (
		<span
			className={`nw-chapter-status-dot${info ? "" : " is-empty"}`}
			style={info ? { background: info.color } : undefined}
			title={title}
			aria-label={title}
		/>
	);
}
