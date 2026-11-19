import { App, Platform } from "obsidian";

/**
 * Obsidian's file explorer hides files it can't open (.epub, .docx, .html),
 * so an export has to be reachable from the system. Desktop Obsidian has the
 * two methods behind "Show in system explorer" and "Open in default app";
 * they're not in the public typings, so they're looked up at runtime.
 */
interface DesktopFileActions {
	showInFolder?: (path: string) => void;
	openWithDefaultApp?: (path: string) => void;
}

function desktopActions(app: App): DesktopFileActions {
	if (!Platform.isDesktopApp) return {};
	return app as unknown as DesktopFileActions;
}

export function canShowInFolder(app: App): boolean {
	return typeof desktopActions(app).showInFolder === "function";
}

export function canOpenWithDefaultApp(app: App): boolean {
	return typeof desktopActions(app).openWithDefaultApp === "function";
}

export function showInFolder(app: App, path: string): void {
	desktopActions(app).showInFolder?.(path);
}

export function openWithDefaultApp(app: App, path: string): void {
	desktopActions(app).openWithDefaultApp?.(path);
}
