import * as yaml from 'js-yaml';
import { App } from 'obsidian';

/**
 * Escribe un valor en el frontmatter de la nota actual
 */
async function writeFrontmatterValue(app: App, key: string, value: string): Promise<void> {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        console.error('No active file found');
        return;
    }

    const content = await app.vault.read(activeFile);
    const frontmatterMatch = content.match(/^---\s*([\s\S]*?)---/);
    
    let frontmatter: Record<string, any> = {};
    
    if (frontmatterMatch) {
        try {
            const parsed = yaml.load(frontmatterMatch[1]);
            if (parsed && typeof parsed === 'object') {
                frontmatter = parsed as Record<string, any>;
            }
        } catch (e) {
            console.error('YAML parse error:', e);
        }
    }

    frontmatter[key] = value;

    const newFrontmatter = yaml.dump(frontmatter);
    let newContent: string;
    
    if (frontmatterMatch) {
        newContent = content.replace(
            /^---[\s\S]*?---/,
            `---\n${newFrontmatter}---`
        );
    } else {
        newContent = `---\n${newFrontmatter}---\n\n${content}`;
    }

    await app.vault.modify(activeFile, newContent);
}

/**
 * Extrae un valor del frontmatter de un archivo
 */
function extractValueFromFrontmatter(content: string, key: string): string | null {
    const match = content.match(/^---\s*([\s\S]*?)---/);
    if (!match) return null;
    
    try {
        const frontmatter: any = yaml.load(match[1]);
        if (frontmatter && typeof frontmatter[key] === 'string') {
            return frontmatter[key];
        }
    } catch (e) {
        console.error('YAML parse error:', e);
    }
    return null;
}

export { writeFrontmatterValue, extractValueFromFrontmatter };