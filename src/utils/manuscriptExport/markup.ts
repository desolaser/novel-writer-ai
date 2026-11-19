/** Escaping shared by the HTML, EPUB and DOCX writers. */

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** HTML text escaping; quotes stay readable in text nodes. */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Characters that would start Markdown syntax in plain text. */
export function escapeMarkdown(text: string): string {
	return text.replace(/([\\*_~=`[\]])/g, '\\$1');
}
