import type { Capitulo, EntradaCodex } from "../../../domain";
import { chapterInfoFacts } from "../../../utils/chapterInfo";
import { useNovelWriter } from "../store/novelWriterStore";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ChapterInfoFields } from "./ChapterInfoFields";
import { useOutlineSectionOpen } from "./useOutlineSectionOpen";

export interface ChapterInfoSectionProps {
	chapter: Capitulo;
}

/** "Drafted · Elena · Old Tower · day 12", or "" when nothing is set. */
function infoSummary(chapter: Capitulo, entries: EntradaCodex[]): string {
	const facts = chapterInfoFacts(chapter, entries, {
		forAi: false,
		includeStatus: true,
	});
	return facts
		.map((fact) => fact.label === "Published"
			? `published ${fact.value}`
			: fact.value)
		.join(" · ");
}

/**
 * The chapter info fields in a section that folds to one line. Closed, the
 * line still shows what is set, so status and point of view stay in sight.
 */
export function ChapterInfoSection({ chapter }: ChapterInfoSectionProps) {
	const entries = useNovelWriter((state) => state.entradas);
	const [open, toggle] = useOutlineSectionOpen("info");
	return (
		<CollapsibleSection
			className="nw-chapter-details"
			title="Details"
			summary={infoSummary(chapter, entries)}
			open={open}
			onToggle={toggle}
		>
			<ChapterInfoFields chapter={chapter} />
		</CollapsibleSection>
	);
}
