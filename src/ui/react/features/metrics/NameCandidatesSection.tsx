import { useState } from "react";
import type { Categoria } from "../../../../domain";
import type { NameCandidate } from "../../../../types/NovelMetrics";
import { MetricsSection, formatNumber } from "./MetricsParts";

const TOP_NAMES = 10;

const HINT = "Capitalized names that appear 3 or more times, at least once in "
	+ "the middle of a sentence, and match no entry name or alias. Found "
	+ "locally, without AI.";

export interface NameCandidatesSectionProps {
	candidates: NameCandidate[];
	categories: Categoria[];
	ignoredCount: number;
	onCreate: (name: string, categoryId: string) => void;
	onIgnore: (name: string) => void;
	onRestoreIgnored: () => void;
}

/** "Characters" when the novel has it; otherwise its first category. */
function defaultCategory(categories: Categoria[]): string {
	const characters = categories.find((category) =>
		category.nombre.toLowerCase() === "characters");
	return (characters ?? categories[0])?.id_categoria ?? "";
}

function candidateMeta(candidate: NameCandidate): string {
	const mentions = `${formatNumber(candidate.mentions)} mentions`;
	const chapters = candidate.chapters === 1
		? "1 chapter"
		: `${candidate.chapters} chapters`;
	return `${mentions} · ${chapters} · from #${candidate.firstChapter}`;
}

/**
 * Proper names of the manuscript without a codex entry, found locally (no AI).
 * Each one can become an entry, or be ignored for this novel.
 */
export function NameCandidatesSection({
	candidates,
	categories,
	ignoredCount,
	onCreate,
	onIgnore,
	onRestoreIgnored,
}: NameCandidatesSectionProps) {
	const [categoryId, setCategoryId] = useState(() => defaultCategory(categories));
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? candidates : candidates.slice(0, TOP_NAMES);
	const category = categories.some((item) => item.id_categoria === categoryId)
		? categoryId
		: defaultCategory(categories);

	return (
		<MetricsSection
			title="Names without an entry"
			hint={HINT}
		>
			{!candidates.length && (
				<p className="nw-metrics-empty">
					Every frequent name in the manuscript has an entry.
				</p>
			)}
			{candidates.length > 0 && (
				<label className="nw-names-category">
					<span>New entries go to</span>
					<select
						className="dropdown"
						value={category}
						onChange={(event) => setCategoryId(event.target.value)}
					>
						{categories.map((item) => (
							<option key={item.id_categoria} value={item.id_categoria}>
								{item.nombre}
							</option>
						))}
					</select>
				</label>
			)}
			<ul className="nw-names-list">
				{visible.map((candidate) => (
					<li key={candidate.name} className="nw-names-row">
						<div className="nw-names-text" title={candidate.example}>
							<span className="nw-names-name">{candidate.name}</span>
							<span className="nw-names-meta">
								{candidateMeta(candidate)}
							</span>
						</div>
						<button
							disabled={!category}
							title={`Create a codex entry named "${candidate.name}"`}
							onClick={() => onCreate(candidate.name, category)}
						>
							Create
						</button>
						<button
							title="Don't suggest this name again for this novel"
							onClick={() => onIgnore(candidate.name)}
						>
							Ignore
						</button>
					</li>
				))}
			</ul>
			{candidates.length > TOP_NAMES && (
				<button
					className="nw-metrics-link"
					onClick={() => setShowAll((value) => !value)}
				>
					{showAll ? "Show fewer" : `Show all ${candidates.length}`}
				</button>
			)}
			{ignoredCount > 0 && (
				<button className="nw-metrics-link" onClick={onRestoreIgnored}>
					Suggest the {ignoredCount} ignored{" "}
					{ignoredCount === 1 ? "name" : "names"} again
				</button>
			)}
		</MetricsSection>
	);
}
