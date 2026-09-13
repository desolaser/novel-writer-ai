import { Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";

/** Base for a modal whose content is a React root, unmounted cleanly on close. */
export abstract class ReactNovelModal extends Modal {
	protected root: Root | null = null;
	onClose() {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
	}
}
