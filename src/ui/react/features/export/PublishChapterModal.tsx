import React from "react";
import { App, Notice } from "obsidian";
import { createRoot } from "react-dom/client";
import { useShallow } from "zustand/react/shallow";
import type NovelWriterPlugin from "../../../../../main";
import type { Capitulo, EntityId } from "../../../../domain";
import type {
	ChapterFormat,
	ExportPreferences,
} from "../../../../types/ManuscriptExport";
import { chaptersInOrder } from "../../../../utils/novelMetrics";
import { dayKey } from "../../../../utils/writingLog";
import {
	nextUnpublishedChapter,
	publishText,
	type PublishText,
} from "../../../../utils/manuscriptExport/publishing";
import { useNovelWriter } from "../../store/novelWriterStore";
import { ReactNovelModal } from "../sidebar/modals/ReactNovelModal";
import { readChapterText } from "./exportSource";
import { readExportPreferences, saveExportPreferences } from "./exportPreferences";
import { copyToClipboard } from "./clipboard";
import { CHAPTER_FORMATS } from "./ExportOptionFields";
import { HeadingFields } from "./HeadingFields";

/**
 * "Copy chapter for publishing": one chapter in the format a web-novel site
 * takes, and the date it went online.
 */
export class PublishChapterModal extends ReactNovelModal {
	constructor(
		app: App,
		private readonly plugin: NovelWriterPlugin,
		private readonly chapterId: EntityId | null,
	) {
		super(app);
		this.modalEl.addClass("nw-export-modal");
	}

	onOpen() {
		this.titleEl.setText("Copy chapter for publishing");
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(
			<PublishView plugin={this.plugin} initialId={this.chapterId} />
		);
	}
}

/** Opens the dialog on a chapter, or on the next one not published yet. */
export function openPublishChapterModal(
	plugin: NovelWriterPlugin,
	chapterId: EntityId | null = null,
) {
	const store = useNovelWriter.getState().store;
	if (!store?.activeNovelId) {
		new Notice("No novel is open.");
		return;
	}
	new PublishChapterModal(plugin.app, plugin, chapterId).open();
}

function chapterLabel(chapter: Capitulo, position: number): string {
	const published = chapter.published_on ? ` ✓ ${chapter.published_on}` : "";
	const file = chapter.archivo ? "" : " (no manuscript)";
	return `#${position} ${chapter.nombre}${file}${published}`;
}

function PublishView({
	plugin,
	initialId,
}: {
	plugin: NovelWriterPlugin;
	initialId: EntityId | null;
}) {
	const { actos, capitulos, novelId, updateCapitulo } = useNovelWriter(
		useShallow((state) => ({
			actos: state.actos,
			capitulos: state.capitulos,
			novelId: state.store?.activeNovelId ?? "",
			updateCapitulo: state.updateCapitulo,
		}))
	);
	const ordered = React.useMemo(
		() => chaptersInOrder(actos, capitulos),
		[actos, capitulos]
	);
	const [selectedId, setSelectedId] = React.useState<EntityId | null>(() =>
		initialId ?? nextUnpublishedChapter(ordered)?.id_capitulo ?? ordered[0]?.id_capitulo ?? null
	);
	const [prefs, setPrefs] = React.useState<ExportPreferences>(() =>
		readExportPreferences(plugin, novelId)
	);
	const [manuscript, setManuscript] = React.useState<string | null>(null);

	const index = ordered.findIndex((chapter) => chapter.id_capitulo === selectedId);
	const chapter = index >= 0 ? ordered[index] : null;

	React.useEffect(() => {
		setManuscript(null);
		if (!chapter) return;
		let current = true;
		readChapterText(chapter).then((text) => {
			if (current) setManuscript(text);
		});
		return () => {
			current = false;
		};
	}, [chapter?.id_capitulo, chapter?.archivo]);

	if (!ordered.length) return <p className="nw-muted">The novel has no chapters yet.</p>;

	const output: PublishText | null = chapter && manuscript !== null
		? publishText(chapter, index + 1, manuscript, {
			format: prefs.chapterFormat,
			includeHeading: prefs.includeChapterHeading,
			style: prefs.headingStyle,
			chapterWord: prefs.chapterWord,
			sceneBreak: prefs.sceneBreak,
		})
		: null;
	const empty = !output || !output.words;

	const change = (patch: Partial<ExportPreferences>) =>
		setPrefs({ ...prefs, ...patch });

	const copy = async (): Promise<boolean> => {
		if (!output || empty) return false;
		try {
			const html = prefs.chapterFormat === "html" ? output.text : undefined;
			const text = html ? output.plain : output.text;
			await copyToClipboard(text, html);
			await saveExportPreferences(plugin, novelId, prefs);
			new Notice(`Copied "${chapter?.nombre}" (${output.words} words).`);
			return true;
		} catch (reason: any) {
			new Notice(`Could not copy: ${reason?.message ?? reason}`);
			return false;
		}
	};

	const copyAndMark = async () => {
		if (!chapter || !(await copy())) return;
		await updateCapitulo(chapter.id_capitulo, { published_on: dayKey(new Date()) });
		// The store reloaded the chapters: the one just marked is published now,
		// so the next unpublished one is the following chapter to post.
		const state = useNovelWriter.getState();
		const fresh = chaptersInOrder(state.actos, state.capitulos);
		const next = nextUnpublishedChapter(fresh, chapter.id_capitulo);
		if (next) setSelectedId(next.id_capitulo);
	};

	const unmark = async () => {
		if (!chapter) return;
		await updateCapitulo(chapter.id_capitulo, { published_on: null });
	};

	return (
		<div className="nw-export">
			<div className="nw-export-fields">
				<label className="nw-export-field">
					<span>Chapter</span>
					<select
						className="dropdown"
						value={selectedId ?? ""}
						onChange={(event) => setSelectedId(event.target.value)}
					>
						{ordered.map((item, position) => (
							<option key={item.id_capitulo} value={item.id_capitulo}>
								{chapterLabel(item, position + 1)}
							</option>
						))}
					</select>
				</label>
				<label className="nw-export-field">
					<span>Format</span>
					<select
						className="dropdown"
						value={prefs.chapterFormat}
						onChange={(event) =>
							change({ chapterFormat: event.target.value as ChapterFormat })
						}
					>
						{CHAPTER_FORMATS.map((format) => (
							<option key={format.id} value={format.id}>
								{format.id === "html" ? "HTML (pastes formatted)" : format.label}
							</option>
						))}
					</select>
				</label>
				<HeadingFields prefs={prefs} onChange={change} />
				<label className="nw-checkbox">
					<input
						type="checkbox"
						checked={prefs.includeChapterHeading}
						onChange={(event) =>
							change({ includeChapterHeading: event.target.checked })
						}
					/>
					Start with the chapter heading
				</label>
			</div>
			<textarea
				className="nw-export-preview"
				readOnly
				value={manuscript === null ? "Reading..." : output?.text ?? ""}
				placeholder="This chapter has no text yet."
			/>
			<p className="nw-export-summary">
				{output ? `${output.words} words` : ""}
				{chapter?.published_on ? ` · published on ${chapter.published_on}` : ""}
			</p>
			<div className="nw-export-buttons">
				{chapter?.published_on && (
					<button onClick={unmark}>Mark as not published</button>
				)}
				<button onClick={() => void copy()} disabled={empty}>
					Copy
				</button>
				{!chapter?.published_on && (
					<button className="mod-cta" onClick={copyAndMark} disabled={empty}>
						Copy and mark as published
					</button>
				)}
			</div>
		</div>
	);
}
