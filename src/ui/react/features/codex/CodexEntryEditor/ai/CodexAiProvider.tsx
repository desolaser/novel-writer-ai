import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../../main';
import type { ChatContextItem } from '../../../../../../domain';
import type { CodexAiField, CodexAiProgress, CodexAiProposal, CodexAiScope } from '../../../../../../types/CodexAi';
import { buildCodexEntryPrompt, buildCodexFieldPrompt, type CodexAiPromptContext } from '../../../../../../context/codexEntryPrompt';
import { buildContextItemsBlock } from '../../../../../../context/contextItems';
import { matchFieldByHeader, parseDelimitedSections, resolveFieldValue } from '../../../../../../utils/codexAiParsing';
import { ApiFactory } from '../../../../../../factories/api-factory';
import { getActiveModelConfig } from '../../../../../../infrastructure/settings/active-model';
import { findFallbackCategory } from '../../../../../../utils/categories';
import { useNovelWriter } from '../../../../store/novelWriterStore';
import { ALIAS_KEY, DESCRIPTION_KEY, useCodexAiFields } from './useCodexAiFields';

/**
 * Generation engine for codex entries. Every model answer becomes a proposal the
 * author accepts or discards; nothing is written to the entry on its own.
 *
 * Three ways to generate, all sharing the same proposal layer:
 *  - one field at a time (plain text answer, nothing to parse),
 *  - field by field in sequence, each call seeing what the previous ones produced,
 *  - every field in a single call, answered as delimited sections.
 */

export interface CodexAiApply {
	/** Persists one of the fixed entry fields (alias, description). */
	setEntryField: (key: 'alias' | 'descripcion', value: string) => Promise<void>;
	/** Persists the value of a detail; `value` is already in stored form. */
	setDetalleValue: (idDetalle: string, value: string | null) => Promise<void>;
}

interface CodexAiContextValue {
	fields: CodexAiField[];
	proposals: Record<string, CodexAiProposal>;
	progress: CodexAiProgress | null;
	busy: boolean;
	instructions: string;
	setInstructions: (value: string) => void;
	contextItems: ChatContextItem[];
	setContextItems: (items: ChatContextItem[]) => void;
	scope: CodexAiScope;
	setScope: (scope: CodexAiScope) => void;
	targetCount: number;
	proposalCount: number;
	generateField: (key: string) => Promise<void>;
	generateSequential: () => Promise<void>;
	generateAtOnce: () => Promise<void>;
	cancel: () => void;
	accept: (key: string) => Promise<void>;
	acceptAll: () => Promise<void>;
	/** True when a reference points at an entry that does not exist yet. */
	canAddToCodex: (key: string) => boolean;
	/** Creates the missing entry, links the reference to it and clears the proposal. */
	addToCodex: (key: string) => Promise<void>;
	discard: (key: string) => void;
	discardAll: () => void;
}

const CodexAiCtx = createContext<CodexAiContextValue | null>(null);

/** Access to the generation state. Returns null outside the provider so fields can opt out. */
export function useCodexAi(): CodexAiContextValue | null {
	return useContext(CodexAiCtx);
}

const maxTokensForField = (field: CodexAiField) => (field.type === 'text' ? 900 : 200);
const maxTokensForFields = (fields: CodexAiField[]) =>
	Math.min(4096, 300 + fields.reduce((total, field) => total + (field.type === 'text' ? 700 : 120), 0));

export function CodexAiProvider({
	plugin,
	entry,
	apply,
	children,
}: {
	plugin: NovelWriterPlugin;
	entry: any;
	apply: CodexAiApply;
	children: React.ReactNode;
}) {
	const { categorias, tags, createEntry } = useNovelWriter() as any;
	const fields = useCodexAiFields(entry);
	const [proposals, setProposals] = useState<Record<string, CodexAiProposal>>({});
	const [progress, setProgress] = useState<CodexAiProgress | null>(null);
	const [busy, setBusy] = useState(false);
	const [instructions, setInstructions] = useState('');
	const [contextItems, setContextItems] = useState<ChatContextItem[]>([]);
	const [scope, setScope] = useState<CodexAiScope>('empty');
	const cancelRef = useRef(false);

	const categoryName = categorias.find((category: any) => category.id_categoria === entry?.id_categoria)?.nombre ?? '';
	const tagNames = (entry?.tags ?? [])
		.map((id: string) => tags.find((tag: any) => tag.id_tag === id)?.nombre)
		.filter(Boolean) as string[];

	const runCompletion = useCallback(async (prompt: string, maxTokens: number): Promise<string> => {
		const settings = plugin.settings.data;
		const activeModel = getActiveModelConfig(settings, 'generate');
		if (!activeModel.modelName) throw new Error('Configure an active model in Settings.');
		const token = settings.apiToken[activeModel.providerId] ?? '';
		const api = new ApiFactory().createApi(activeModel.providerId, token);
		const result = await api.generateCompletion(prompt, activeModel.modelName, {
			...activeModel.options,
			max_tokens: maxTokens,
			stream: false,
		});
		const text = (result.text ?? '').trim();
		if (!text) throw new Error('The model returned an empty answer.');
		return text;
	}, [plugin]);

	/** Snapshot of the entry where pending proposals count as known values, keeping runs coherent. */
	const snapshotWith = useCallback((pending: Record<string, CodexAiProposal>): CodexAiField[] =>
		fields.map((field) => {
			const proposal = pending[field.key];
			if (proposal?.status !== 'ready' || !proposal.text) return field;
			return { ...field, currentText: proposal.text, currentValue: proposal.value };
		}), [fields]);

	const buildContext = useCallback((snapshot: CodexAiField[], exclude: Set<string>): CodexAiPromptContext => ({
		entryName: entry?.nombre ?? '',
		category: categoryName,
		tags: tagNames,
		fields: snapshot.filter((field) => !exclude.has(field.key)),
		instructions,
		extraContext: buildContextItemsBlock(contextItems),
	}), [entry?.nombre, categoryName, tagNames.join(','), instructions, contextItems]);

	const targetsFor = useCallback((currentScope: CodexAiScope) =>
		fields.filter((field) => currentScope === 'all' || !field.currentText.trim()), [fields]);

	const setProposal = (key: string, proposal: CodexAiProposal) =>
		setProposals((previous) => ({ ...previous, [key]: proposal }));

	const generateField = useCallback(async (key: string) => {
		const field = fields.find((item) => item.key === key);
		if (!field || busy) return;
		setBusy(true);
		setProposal(key, { key, status: 'loading', text: '', value: null });
		try {
			const snapshot = snapshotWith(proposals);
			const prompt = buildCodexFieldPrompt(buildContext(snapshot, new Set([key])), field);
			const answer = await runCompletion(prompt, maxTokensForField(field));
			const resolved = resolveFieldValue(field, answer);
			setProposal(key, { key, status: 'ready', text: resolved.text, value: resolved.value, unmatched: resolved.unmatched });
		} catch (error: any) {
			setProposal(key, { key, status: 'error', text: '', value: null, error: error?.message ?? String(error) });
		} finally {
			setBusy(false);
		}
	}, [fields, busy, proposals, snapshotWith, buildContext, runCompletion]);

	const generateSequential = useCallback(async () => {
		const targets = targetsFor(scope);
		if (!targets.length || busy) return;
		setBusy(true);
		cancelRef.current = false;
		let pending = { ...proposals };
		try {
			for (let index = 0; index < targets.length; index += 1) {
				if (cancelRef.current) break;
				const field = targets[index];
				setProgress({ current: index + 1, total: targets.length, label: field.label });
				setProposal(field.key, { key: field.key, status: 'loading', text: '', value: null });
				try {
					const snapshot = snapshotWith(pending);
					const prompt = buildCodexFieldPrompt(buildContext(snapshot, new Set([field.key])), field);
					const answer = await runCompletion(prompt, maxTokensForField(field));
					const resolved = resolveFieldValue(field, answer);
					const proposal: CodexAiProposal = { key: field.key, status: 'ready', text: resolved.text, value: resolved.value, unmatched: resolved.unmatched };
					pending = { ...pending, [field.key]: proposal };
					setProposal(field.key, proposal);
				} catch (error: any) {
					setProposal(field.key, { key: field.key, status: 'error', text: '', value: null, error: error?.message ?? String(error) });
				}
			}
		} finally {
			setProgress(null);
			setBusy(false);
			cancelRef.current = false;
		}
	}, [targetsFor, scope, busy, proposals, snapshotWith, buildContext, runCompletion]);

	const generateAtOnce = useCallback(async () => {
		const targets = targetsFor(scope);
		if (!targets.length || busy) return;
		setBusy(true);
		setProgress({ current: 0, total: targets.length, label: 'all fields' });
		targets.forEach((field) => setProposal(field.key, { key: field.key, status: 'loading', text: '', value: null }));
		try {
			const snapshot = snapshotWith({});
			const targetKeys = new Set(targets.map((field) => field.key));
			const prompt = buildCodexEntryPrompt(buildContext(snapshot, targetKeys), targets);
			const answer = await runCompletion(prompt, maxTokensForFields(targets));
			const sections = parseDelimitedSections(answer);
			const next: Record<string, CodexAiProposal> = {};
			for (const section of sections) {
				const field = matchFieldByHeader(section.header, targets);
				if (!field || next[field.key]) continue;
				const resolved = resolveFieldValue(field, section.body);
				if (!resolved.text) continue;
				next[field.key] = { key: field.key, status: 'ready', text: resolved.text, value: resolved.value, unmatched: resolved.unmatched };
			}
			// Nothing recognizable came back: keep the answer as a description draft
			// rather than throwing it away, so the call is never wasted.
			const description = targets.find((field) => field.key === DESCRIPTION_KEY);
			if (!Object.keys(next).length && description) {
				const resolved = resolveFieldValue(description, answer);
				if (resolved.text) next[description.key] = { key: description.key, status: 'ready', text: resolved.text, value: resolved.value, unmatched: false };
			}
			setProposals((previous) => {
				const merged = { ...previous };
				targets.forEach((field) => { delete merged[field.key]; });
				return { ...merged, ...next };
			});
			const missing = targets.length - Object.keys(next).length;
			if (missing > 0) new Notice(`${missing} field(s) came back unusable. Try again or generate them one by one.`);
		} catch (error: any) {
			const message = error?.message ?? String(error);
			setProposals((previous) => {
				const merged = { ...previous };
				targets.forEach((field) => { merged[field.key] = { key: field.key, status: 'error', text: '', value: null, error: message }; });
				return merged;
			});
		} finally {
			setProgress(null);
			setBusy(false);
		}
	}, [targetsFor, scope, busy, snapshotWith, buildContext, runCompletion]);

	const cancel = useCallback(() => { cancelRef.current = true; }, []);

	const discard = useCallback((key: string) => setProposals((previous) => {
		const next = { ...previous };
		delete next[key];
		return next;
	}), []);

	const discardAll = useCallback(() => setProposals({}), []);

	const applyProposal = useCallback(async (field: CodexAiField, proposal: CodexAiProposal) => {
		if (field.key === ALIAS_KEY) { await apply.setEntryField('alias', proposal.value ?? ''); return; }
		if (field.key === DESCRIPTION_KEY) { await apply.setEntryField('descripcion', proposal.value ?? ''); return; }
		if (field.idDetalle) await apply.setDetalleValue(field.idDetalle, proposal.value);
	}, [apply]);

	const accept = useCallback(async (key: string) => {
		const field = fields.find((item) => item.key === key);
		const proposal = proposals[key];
		if (!field || !proposal || proposal.status !== 'ready' || proposal.unmatched) return;
		try {
			await applyProposal(field, proposal);
			discard(key);
		} catch (error: any) {
			new Notice(`Could not apply the suggestion: ${error?.message ?? String(error)}`);
		}
	}, [fields, proposals, applyProposal, discard]);

	const acceptAll = useCallback(async () => {
		const applicable = fields
			.map((field) => ({ field, proposal: proposals[field.key] }))
			.filter(({ proposal }) => proposal?.status === 'ready' && !proposal.unmatched);
		for (const { field, proposal } of applicable) {
			try {
				await applyProposal(field, proposal);
			} catch (error: any) {
				new Notice(`Could not apply "${field.label}": ${error?.message ?? String(error)}`);
			}
		}
		setProposals((previous) => {
			const next = { ...previous };
			applicable.forEach(({ field }) => { delete next[field.key]; });
			return next;
		});
	}, [fields, proposals, applyProposal]);

	const canAddToCodex = useCallback((key: string) => {
		const field = fields.find((item) => item.key === key);
		const proposal = proposals[key];
		return Boolean(
			field?.type === 'codex_ref'
			&& field.idDetalle
			&& proposal?.status === 'ready'
			&& proposal.unmatched
			&& proposal.text.trim()
			&& findFallbackCategory(categorias),
		);
	}, [fields, proposals, categorias]);

	const addToCodex = useCallback(async (key: string) => {
		if (!canAddToCodex(key)) return;
		const field = fields.find((item) => item.key === key)!;
		const name = proposals[key].text.trim();
		const category = findFallbackCategory(categorias);
		try {
			const created = await createEntry(category.id_categoria, name);
			if (!created) throw new Error('The entry could not be created.');
			await apply.setDetalleValue(field.idDetalle!, created.id_entrada_codex);
			discard(key);
			new Notice(`"${name}" added to ${category.nombre} and linked.`);
		} catch (error: any) {
			new Notice(`Could not add "${name}" to the codex: ${error?.message ?? String(error)}`);
		}
	}, [canAddToCodex, fields, proposals, categorias, createEntry, apply, discard]);

	const value = useMemo<CodexAiContextValue>(() => ({
		fields,
		proposals,
		progress,
		busy,
		instructions,
		setInstructions,
		contextItems,
		setContextItems,
		scope,
		setScope,
		targetCount: targetsFor(scope).length,
		proposalCount: Object.keys(proposals).length,
		generateField,
		generateSequential,
		generateAtOnce,
		cancel,
		accept,
		acceptAll,
		canAddToCodex,
		addToCodex,
		discard,
		discardAll,
	}), [fields, proposals, progress, busy, instructions, contextItems, scope, targetsFor, generateField, generateSequential, generateAtOnce, cancel, accept, acceptAll, canAddToCodex, addToCodex, discard, discardAll]);

	return <CodexAiCtx.Provider value={value}>{children}</CodexAiCtx.Provider>;
}
