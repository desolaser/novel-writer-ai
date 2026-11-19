/**
 * Copies a chapter. HTML goes to the clipboard as rich text and as plain text
 * at once: a site's visual editor (Wattpad, Webnovel) pastes it formatted, a
 * plain field gets the text.
 */
export async function copyToClipboard(text: string, html?: string): Promise<void> {
	const ClipboardItemClass = (window as any).ClipboardItem;
	if (html && ClipboardItemClass && navigator.clipboard?.write) {
		const item = new ClipboardItemClass({
			"text/html": new Blob([html], { type: "text/html" }),
			"text/plain": new Blob([text], { type: "text/plain" }),
		});
		await navigator.clipboard.write([item]);
		return;
	}
	await navigator.clipboard.writeText(text);
}
