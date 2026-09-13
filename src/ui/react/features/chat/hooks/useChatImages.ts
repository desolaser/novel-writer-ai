import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type { Categoria, EntradaCodex } from '../../../../../domain';
import { canvasToDataUrl, cropToCanvas } from '../../../../../utils/image';
import { openEntryModal } from '../../codex/modals/CodexEntryModal';
import { ThumbnailCropModal } from '../../codex/ThumbnailCropModal';
import { FolderPickerModal } from '../modals/FolderPickerModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { includesQuery } from '../chatContextHelpers';

const dataUrlToArrayBuffer = async (dataUrl: string): Promise<ArrayBuffer> => {
	const res = await fetch(dataUrl);
	return res.arrayBuffer();
};

interface UseChatImagesParams {
	plugin: NovelWriterPlugin;
	categorias: Categoria[];
	entradas: EntradaCodex[];
	setSidebarTab: (tab: any) => void;
	setEntryThumbnail: (entryId: string, dataUrl: string) => Promise<void>;
	supportsVision: boolean;
}

/**
 * Owns everything image-related in the chat: the upload/paste queue attached to the
 * next message, the per-generated-image dropdown (download / save to vault / set as
 * a codex thumbnail) and the lightbox.
 */
export function useChatImages({ plugin, categorias, entradas, setSidebarTab, setEntryThumbnail, supportsVision }: UseChatImagesParams) {
	const [uploadedImages, setUploadedImages] = useState<string[]>([]);
	const [imageDropdown, setImageDropdown] = useState<{ index: number; searchQuery: string } | null>(null);
	const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const closeImageDropdown = useCallback(() => setImageDropdown(null), []);

	const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;
		const readers: Promise<string>[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file.type.startsWith('image/')) continue;
			readers.push(new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.readAsDataURL(file);
			}));
		}
		void Promise.all(readers).then(urls => {
			setUploadedImages(prev => [...prev, ...urls]);
		});
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	const removeUploadedImage = useCallback((index: number) => {
		setUploadedImages(prev => prev.filter((_, i) => i !== index));
	}, []);

	const clearUploadedImages = useCallback(() => setUploadedImages([]), []);

	// Paste handler for clipboard images (Ctrl+V) — only when textarea is focused
	useEffect(() => {
		const handler = (e: ClipboardEvent) => {
			if (!supportsVision) return;
			if (document.activeElement !== textareaRef.current) return;
			const items = e.clipboardData?.items;
			if (!items) return;
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.type.startsWith('image/')) {
					e.preventDefault();
					const blob = item.getAsFile();
					if (!blob) continue;
					const reader = new FileReader();
					reader.onload = () => {
						setUploadedImages(prev => [...prev, reader.result as string]);
					};
					reader.readAsDataURL(blob);
					break;
				}
			}
		};
		document.addEventListener('paste', handler);
		return () => document.removeEventListener('paste', handler);
	}, [supportsVision]);

	const saveImageToVault = useCallback(async (dataUrl: string, filename: string) => {
		const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
		const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
		const foldersList = plugin.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
		new FolderPickerModal(plugin.app, foldersList, async (folder) => {
			try {
				const buf = await dataUrlToArrayBuffer(dataUrl);
				const finalName = `${filename}.${ext}`;
				const filePath = `${folder.path}/${finalName}`;
				const existing = plugin.app.vault.getAbstractFileByPath(filePath);
				if (existing) {
					new Notice(`⚠️ A file already exists at ${filePath}`);
					return;
				}
				await plugin.app.vault.createBinary(filePath, buf);
				new Notice(`✅ Image saved to ${filePath}`);
				closeImageDropdown();
			} catch (e: any) {
				new Notice(`❌ Error saving: ${e?.message ?? String(e)}`);
			}
		}).open();
	}, [plugin, closeImageDropdown]);

	/** Check if image is square; if not, show crop modal first, then save. */
	const cropThenSetThumbnail = useCallback((dataUrl: string, entryId: string, entryName: string) => {
		const img = new Image();
		img.onload = () => {
			if (Math.abs(img.naturalWidth - img.naturalHeight) <= 2) {
				// Already square – set directly
				void (async () => {
					const out = Math.min(480, img.naturalWidth, img.naturalHeight);
					const canvas = cropToCanvas(img, 0, 0, out, out, out, out);
					await setEntryThumbnail(entryId, canvasToDataUrl(canvas, "image/png"));
					new Notice(`✅ Image added as thumbnail for "${entryName}"`);
					closeImageDropdown();
				})();
			} else {
				// Not square – show crop modal
				new ThumbnailCropModal(plugin.app, dataUrl, async (croppedDataUrl) => {
					await setEntryThumbnail(entryId, croppedDataUrl);
					new Notice(`✅ Image added as thumbnail for "${entryName}"`);
					closeImageDropdown();
				}).open();
			}
		};
		img.onerror = () => {
			new Notice('❌ Could not load the image for cropping.');
		};
		img.src = dataUrl;
	}, [plugin, setEntryThumbnail, closeImageDropdown]);

	/** Handle: click codex entry in image dropdown → open editor + replace thumbnail flow */
	const handleImageToCodexEntry = useCallback((entryId: string, dataUrl: string) => {
		const entry = entradas.find(e => e.id_entrada_codex === entryId);
		if (!entry) return;
		closeImageDropdown();
		// Open the CodexEntryModal so the user sees the entry
		setSidebarTab('codex');
		openEntryModal(plugin, entryId);
		// Then handle thumbnail
		const doSet = (url: string) => cropThenSetThumbnail(url, entry.id_entrada_codex, entry.nombre);
		if (entry.thumbnail) {
			new ConfirmModal(plugin.app, `Are you sure you want to replace the thumbnail for "${entry.nombre}"?`, () => doSet(dataUrl)).open();
		} else {
			doSet(dataUrl);
		}
	}, [entradas, plugin, closeImageDropdown, cropThenSetThumbnail, setSidebarTab]);

	const downloadImage = useCallback((dataUrl: string, filename: string) => {
		const link = document.createElement('a');
		link.href = dataUrl;
		const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
		const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
		link.download = `${filename}.${ext}`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		closeImageDropdown();
	}, [closeImageDropdown]);

	const imageCodexCategories = useMemo(() => {
		const sq = imageDropdown?.searchQuery ?? '';
		return categorias.map(category => ({
			category,
			entries: entradas.filter(entry => !entry.archivado && entry.id_categoria === category.id_categoria && includesQuery(sq, entry.nombre, entry.alias)),
		})).filter(group => group.entries.length);
	}, [categorias, entradas, imageDropdown?.searchQuery]);

	return {
		uploadedImages, setUploadedImages, handleImageUpload, removeUploadedImage, clearUploadedImages,
		imageDropdown, setImageDropdown, closeImageDropdown,
		lightboxSrc, setLightboxSrc,
		fileInputRef, textareaRef,
		saveImageToVault, handleImageToCodexEntry, downloadImage, imageCodexCategories,
	};
}
