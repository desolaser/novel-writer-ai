import { App, Modal, Notice } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { useNovelWriter } from '../../../store/novelWriterStore';
import type {
	CodexSchema,
	CodexSchemaMergeSummary,
} from '../../../../../types/CodexSchema';
import {
	findCategoriaByName,
	findDetalleByName,
} from '../../../../../utils/codexSchemaMerge';
import { SchemaChecklist, SchemaChecklistItem } from './SchemaChecklist';

/**
 * Copies custom categories and details from another novel into the active
 * one. Opened from the Categories and Custom Details modals.
 */
export class CodexSchemaImportModal extends Modal {
	private root: Root | null = null;

	constructor(app: App) {
		super(app);
		this.modalEl.addClass('nw-schema-import-modal');
	}

	onOpen() {
		this.root = createRoot(this.contentEl);
		this.root.render(
			<CodexSchemaImportView close={() => this.close()} />,
		);
	}

	onClose() {
		this.root?.unmount();
		this.root = null;
	}
}

function CodexSchemaImportView({ close }: { close: () => void }) {
	const novels = useNovelWriter(s => s.novels);
	const activeNovelId = useNovelWriter(s => s.activeNovelId);
	const categorias = useNovelWriter(s => s.categorias);
	const detalles = useNovelWriter(s => s.detalles);
	const readCodexSchemaOf = useNovelWriter(s => s.readCodexSchemaOf);
	const importCodexSchema = useNovelWriter(s => s.importCodexSchema);

	const others = novels.filter(n => n.novela.id_novela !== activeNovelId);
	const [sourceId, setSourceId] = React.useState<string>(
		others[0]?.novela.id_novela ?? '',
	);
	const [source, setSource] = React.useState<CodexSchema | null>(null);
	const [pickedCats, setPickedCats] = React.useState<Set<string>>(new Set());
	const [pickedDets, setPickedDets] = React.useState<Set<string>>(new Set());
	const [busy, setBusy] = React.useState(false);

	const categoryItems: SchemaChecklistItem[] = React.useMemo(() => {
		if (!source) return [];
		return source.categorias
			.filter(c => !c.system)
			.map(c => ({
				id: c.id_categoria,
				label: c.nombre || '(unnamed)',
				color: c.color,
				exists: !!findCategoriaByName(categorias, c.nombre),
			}));
	}, [source, categorias]);

	const detailItems: SchemaChecklistItem[] = React.useMemo(() => {
		if (!source) return [];
		return [...source.detalles]
			.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
			.map(d => ({
				id: d.id_detalle,
				label: d.nombre || '(unnamed)',
				badge: d.tipo_detalle,
				exists: !!findDetalleByName(detalles, d.nombre),
			}));
	}, [source, detalles]);

	// Load the chosen novel's schema; pick everything new by default.
	React.useEffect(() => {
		let cancelled = false;
		setSource(null);
		if (!sourceId) return;
		readCodexSchemaOf(sourceId).then(schema => {
			if (!cancelled) setSource(schema);
		});
		return () => {
			cancelled = true;
		};
	}, [sourceId, readCodexSchemaOf]);

	React.useEffect(() => {
		setPickedCats(newIds(categoryItems));
		setPickedDets(newIds(detailItems));
		// Only when the source changes, not on every store reload.
	}, [source]);

	const lostLinks = source
		? countLostLinks(source, pickedCats, pickedDets, categoryItems)
		: 0;
	const nothingPicked = pickedCats.size === 0 && pickedDets.size === 0;

	const doImport = async () => {
		if (!sourceId || nothingPicked) return;
		setBusy(true);
		try {
			const summary = await importCodexSchema(sourceId, {
				categoryIds: [...pickedCats],
				detailIds: [...pickedDets],
			});
			if (summary) new Notice(describeImport(summary));
			close();
		} catch (error: any) {
			new Notice(`Import failed: ${error?.message ?? String(error)}`);
		} finally {
			setBusy(false);
		}
	};

	if (others.length === 0) {
		return (
			<div className="nw-direct-content">
				<h3>Import from novel</h3>
				<p className="nw-muted">There are no other novels to import from.</p>
			</div>
		);
	}

	return (
		<div className="nw-direct-content">
			<h3>Import from novel</h3>
			<p className="nw-muted">
				Copies custom categories and details (with their options) into
				this novel. Entries are not copied, and items with the same name
				are left as they are.
			</p>
			<select
				className="nw-select"
				value={sourceId}
				onChange={e => setSourceId(e.target.value)}
			>
				{others.map(n => (
					<option key={n.novela.id_novela} value={n.novela.id_novela}>
						{n.novela.nombre}
					</option>
				))}
			</select>
			{!source && <p className="nw-muted">Loading...</p>}
			{source && (
				<div className="nw-schema-import-lists">
					<SchemaChecklist
						title="Categories"
						items={categoryItems}
						checked={pickedCats}
						onChange={setPickedCats}
						emptyText="No custom categories."
					/>
					<SchemaChecklist
						title="Details"
						items={detailItems}
						checked={pickedDets}
						onChange={setPickedDets}
						emptyText="No custom details."
					/>
				</div>
			)}
			{lostLinks > 0 && (
				<p className="nw-muted">
					Some selected details belong to categories you are not
					importing. They will be imported without those categories.
				</p>
			)}
			<div className="nw-modal-actions">
				<button className="nw-btn" onClick={close}>Cancel</button>
				<button
					className="nw-btn nw-btn-primary"
					disabled={busy || nothingPicked}
					onClick={doImport}
				>
					Import
				</button>
			</div>
		</div>
	);
}

function newIds(items: SchemaChecklistItem[]): Set<string> {
	return new Set(items.filter(item => !item.exists).map(item => item.id));
}

/**
 * Links from a picked detail to a custom category that will not exist in
 * this novel (not picked and not already here under the same name).
 */
function countLostLinks(
	source: CodexSchema,
	pickedCats: Set<string>,
	pickedDets: Set<string>,
	categoryItems: SchemaChecklistItem[],
): number {
	const missing = new Set(
		categoryItems
			.filter(item => !item.exists && !pickedCats.has(item.id))
			.map(item => item.id),
	);
	return source.detalle_categorias.filter(link =>
		pickedDets.has(link.id_detalle) && missing.has(link.id_categoria),
	).length;
}

function describeImport(summary: CodexSchemaMergeSummary): string {
	const cats = plural(summary.categoriesAdded, 'category', 'categories');
	const dets = plural(summary.detailsAdded, 'detail', 'details');
	return `Imported ${cats} and ${dets}.`;
}

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}
