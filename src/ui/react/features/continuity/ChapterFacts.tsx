import { useState } from "react";
import { Notice } from "obsidian";
import type { Capitulo } from "../../../../domain";
import type { ChapterContinuity } from "../../../../types/Continuity";
import { addFact, editFact, removeFact } from "../../../../utils/storyFacts";
import { CommitInput } from "../../components/CommitInput";
import { Icon } from "../../components/Icon";
import { useContinuityChecker } from "./continuityContext";
import { useChapterContinuity } from "./useChapterContinuity";
import { AddFactInput } from "./AddFactInput";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { useOutlineSectionOpen } from "../../outline/useOutlineSectionOpen";

export interface ChapterFactsProps {
	chapter: Capitulo;
}

/**
 * The facts a chapter establishes, used by the continuity check. Extracted
 * with AI from the manuscript; the author edits, deletes or adds them. An
 * edited or added fact is kept when the chapter is extracted again.
 */
export function ChapterFacts({ chapter }: ChapterFactsProps) {
	const checker = useContinuityChecker();
	const { entry, stale, error } = useChapterContinuity(checker, chapter.id_capitulo);
	const [extracting, setExtracting] = useState(false);
	const [open, toggle] = useOutlineSectionOpen("facts");

	const change = async (update: (current: ChapterContinuity) => ChapterContinuity) => {
		try {
			await checker.updateEntry(chapter.id_capitulo, update);
		} catch (reason: any) {
			new Notice(`Could not save the facts: ${reason?.message ?? reason}`);
		}
	};

	const extract = async () => {
		setExtracting(true);
		try {
			const result = await checker.extractFacts(chapter);
			if (!result) new Notice(`"${chapter.nombre}" has no text yet.`);
		} catch (reason: any) {
			new Notice(`Could not extract facts: ${reason?.message ?? reason}`);
		} finally {
			setExtracting(false);
		}
	};

	return (
		<CollapsibleSection
			className="nw-facts"
			title="Facts"
			count={entry.facts.length}
			open={open}
			onToggle={toggle}
			actions={
				<button
					className="nw-btn nw-btn-icon"
					disabled={extracting || !chapter.archivo}
					title="Extract the facts from the manuscript with AI"
					aria-label="Extract facts with AI"
					onClick={() => void extract()}
				>
					{extracting ? "…" : <Icon.Refresh width={12} height={12} />}
				</button>
			}
		>
			{error && <p className="nw-continuity-error">{error}</p>}
			{stale && entry.facts.length > 0 && (
				<p className="nw-scenes-empty">
					The text changed since these facts were extracted.
				</p>
			)}
			{!entry.facts.length && (
				<p className="nw-scenes-empty">
					No facts yet. Extract them, or check continuity from the chapter menu.
				</p>
			)}
			<ul className="nw-facts-list">
				{entry.facts.map((fact) => (
					<li
						key={fact.id}
						className={`nw-fact is-${fact.source}`}
						title={fact.source === "ai"
							? "Extracted by AI; replaced when extracting again"
							: "Yours; kept when extracting again"}
					>
						<CommitInput
							className="nw-fact-text"
							value={fact.text}
							ariaLabel="Fact"
							onCommit={(text) => change((current) =>
								editFact(current, fact.id, text))}
						/>
						<button
							className="nw-btn nw-btn-icon"
							title="Delete fact"
							aria-label="Delete fact"
							onClick={() => void change((current) =>
								removeFact(current, fact.id))}
						>
							<Icon.X width={11} height={11} />
						</button>
					</li>
				))}
			</ul>
			<AddFactInput onAdd={(text) => change((current) => addFact(current, text))} />
		</CollapsibleSection>
	);
}
