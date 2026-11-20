import React from "react";
import { Notice } from "obsidian";
import type NovelWriterPlugin from "../../../../../main";
import type { Capitulo } from "../../../../domain";
import type { ContinuityReport } from "../../../../types/Continuity";
import { dismissIssue, storyTextHash } from "../../../../utils/storyFacts";
import { findQuote } from "../../../../utils/quoteLocation";
import { useNovelWriter } from "../../store/novelWriterStore";
import { ContinuityChecker } from "./continuityChecker";
import { ContinuityIssueCard } from "./ContinuityIssueCard";
import { revealQuote } from "./revealQuote";

export function findChapter(id: string): Capitulo | undefined {
	return useNovelWriter.getState().capitulos.find((item) => item.id_capitulo === id);
}

type ViewState =
	| { kind: "loading" }
	| { kind: "checking"; status: string }
	| { kind: "error"; message: string }
	| { kind: "ready"; report: ContinuityReport; skipped: string[] };

function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * The report of a chapter: shows the saved one, or runs a check when there is
 * none. A check keeps going if the modal closes; its report is saved.
 */
export function ContinuityView({
	plugin,
	chapterId,
	close,
}: {
	plugin: NovelWriterPlugin;
	chapterId: string;
	close: () => void;
}) {
	const checker = React.useMemo(() => new ContinuityChecker(plugin), [plugin]);
	const [state, setState] = React.useState<ViewState>({ kind: "loading" });
	const [manuscript, setManuscript] = React.useState("");
	const mounted = React.useRef(true);
	React.useEffect(() => () => {
		mounted.current = false;
	}, []);

	const update = (next: ViewState) => {
		if (mounted.current) setState(next);
	};

	const runCheck = async () => {
		const chapter = findChapter(chapterId);
		if (!chapter) {
			update({ kind: "error", message: "The chapter no longer exists." });
			return;
		}
		update({ kind: "checking", status: "Starting..." });
		try {
			const result = await checker.check(chapter, (status) =>
				update({ kind: "checking", status }));
			const text = await useNovelWriter.getState().readCapituloTexto(chapterId);
			if (mounted.current) setManuscript(text);
			update({ kind: "ready", report: result.report, skipped: result.skipped });
		} catch (error: any) {
			update({ kind: "error", message: error?.message ?? String(error) });
		}
	};

	React.useEffect(() => {
		void (async () => {
			try {
				const ledger = await checker.readLedger();
				const text = await useNovelWriter.getState().readCapituloTexto(chapterId);
				if (mounted.current) setManuscript(text);
				const report = ledger.chapters[chapterId]?.report;
				if (report) update({ kind: "ready", report, skipped: [] });
				else await runCheck();
			} catch (error: any) {
				update({ kind: "error", message: error?.message ?? String(error) });
			}
		})();
	}, [chapterId]);

	if (state.kind === "loading") return <p className="nw-muted">Loading...</p>;
	if (state.kind === "checking") {
		return (
			<div className="nw-continuity">
				<p className="nw-muted">{state.status}</p>
				<p className="nw-continuity-summary">
					You can close this window; the report is saved when it ends.
				</p>
			</div>
		);
	}
	if (state.kind === "error") {
		return (
			<div className="nw-continuity">
				<p className="nw-continuity-error">{state.message}</p>
				<div className="nw-export-buttons">
					<button onClick={close}>Close</button>
					<button className="mod-cta" onClick={() => void runCheck()}>
						Try again
					</button>
				</div>
			</div>
		);
	}

	const { report, skipped } = state;
	const chapters = checker.chapters();
	const stale = Boolean(manuscript) && storyTextHash(manuscript) !== report.text_hash;

	const sourceOf = (id: string | null): string => {
		if (!id) return "";
		const index = chapters.findIndex((item) => item.id_capitulo === id);
		return index < 0 ? "" : `Ch. ${index + 1} "${chapters[index].nombre}"`;
	};

	const dismiss = async (issueId: string) => {
		try {
			const entry = await checker.updateEntry(
				chapterId, (current) => dismissIssue(current, issueId),
			);
			if (entry.report) update({ kind: "ready", report: entry.report, skipped });
		} catch (error: any) {
			new Notice(`Could not dismiss: ${error?.message ?? error}`);
		}
	};

	const reveal = async (quote: string) => {
		const chapter = findChapter(chapterId);
		if (!chapter) return;
		close();
		if (!(await revealQuote(plugin, chapter, quote))) {
			new Notice("That passage is no longer in the chapter.");
		}
	};

	return (
		<div className="nw-continuity">
			<p className="nw-continuity-summary">
				Checked {formatDate(report.checked_at)} against {report.facts_checked}{" "}
				facts from earlier chapters and the codex.
				{stale ? " The chapter changed since then." : ""}
			</p>
			{skipped.length > 0 && (
				<p className="nw-continuity-summary">
					The facts of {skipped.join(", ")} could not be read this time.
				</p>
			)}
			{report.issues.length === 0 && (
				<p>No contradictions found.</p>
			)}
			{report.issues.map((issue) => (
				<ContinuityIssueCard
					key={issue.id}
					issue={issue}
					source={issue.fact_chapter_id === null && issue.fact
						? "codex or unknown chapter"
						: sourceOf(issue.fact_chapter_id)}
					canReveal={Boolean(findQuote(manuscript, issue.quote))}
					onReveal={() => void reveal(issue.quote)}
					onDismiss={() => void dismiss(issue.id)}
				/>
			))}
			<div className="nw-export-buttons">
				<button onClick={close}>Close</button>
				<button className="mod-cta" onClick={() => void runCheck()}>
					Check again
				</button>
			</div>
		</div>
	);
}
