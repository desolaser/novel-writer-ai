/**
 * Roleplay placeholders: {{user}} and {{char}}.
 *
 * Text that uses them (a character's first message, for now) is stored raw and
 * resolved every time it is shown or sent to the model, never on the way in. The
 * author picks the character before they can pick who they impersonate, so a
 * value baked in at write time would be stale as soon as they take a persona.
 */

/** Stand-in for the author when they are not impersonating anyone. */
export const DEFAULT_USER_LABEL = 'User';

export interface RoleplayNames {
	/** Name of the character the author impersonates, if any. */
	user?: string | null;
	/** Name of the codex entry the AI is roleplaying, if any. */
	char?: string | null;
}

export function resolvePlaceholders(text: string, names: RoleplayNames): string {
	if (!text || !text.includes('{{')) return text;
	const user = names.user?.trim() || DEFAULT_USER_LABEL;
	const char = names.char?.trim();
	let resolved = text.replace(/\{\{\s*user\s*\}\}/gi, user);
	// Without a character there is nothing to put in its place, so the text is
	// left as written instead of losing a word.
	if (char) resolved = resolved.replace(/\{\{\s*char\s*\}\}/gi, char);
	return resolved;
}
