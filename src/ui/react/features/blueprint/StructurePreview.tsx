import React from "react";

/**
 * The structure as editable Markdown. It is what gets parsed on apply, so the
 * author always sees exactly what will become acts and chapters.
 */
export function StructurePreview({
	markdown,
	chapters,
	expectedChapters,
	edited,
	onChange,
	onRebuild,
}: {
	markdown: string;
	chapters: number;
	expectedChapters: number;
	edited: boolean;
	onChange: (markdown: string) => void;
	onRebuild: () => void;
}) {
	return (
		<div className="nw-blueprint-structure">
			<div className="nw-blueprint-structure-head">
				<strong>Structure</strong>
				<span className="nw-muted">
					{chapters} {chapters === 1 ? "chapter" : "chapters"}
					{chapters !== expectedChapters && ` (form says ${expectedChapters})`}
				</span>
				<button className="nw-btn nw-btn-small" onClick={onRebuild}>
					Rebuild
				</button>
			</div>
			<textarea
				className="nw-textarea nw-blueprint-markdown"
				value={markdown}
				spellCheck={false}
				onChange={(event) => onChange(event.target.value)}
				placeholder={"## Act 1 - Setup\nWhat the act is for.\n\n### Chapter 1\nWhat happens in the chapter."}
			/>
			<p className="nw-muted nw-blueprint-hint">
				{edited
					? "Edited by hand. Rebuilding replaces it with the template layout."
					: "`##` starts an act, `###` starts a chapter, and the text under a chapter is its outline."}
			</p>
		</div>
	);
}
