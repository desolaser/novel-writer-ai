import * as yaml from 'js-yaml';

type LorebookMeta = {
    keys: string[], 
    enabled: boolean, 
    alwaysOn: boolean
}

function extractLorebookMeta(content: string): LorebookMeta {
    const match = content.match(/^---\s*([\s\S]*?)---/);
    let keys: string[] = [];
    let enabled = true;
    let alwaysOn = false;
    if (!match) return { keys, enabled, alwaysOn };
    try {
        const frontmatter: any = yaml.load(match[1]);
        if (frontmatter) {
            if (Array.isArray(frontmatter['keys'])) {
                keys = frontmatter['keys'].map((k: any) => String(k));
            } else if (typeof frontmatter['keys'] === 'string') {
                keys = [frontmatter['keys']];
            }
            if (typeof frontmatter['enabled'] === 'boolean') {
                enabled = frontmatter['enabled'];
            }
            if (typeof frontmatter['alwaysOn'] === 'boolean') {
                alwaysOn = frontmatter['alwaysOn'];
            }
        }
    } catch (e) {
        console.error('YAML parse error:', e);
    }
    return { keys, enabled, alwaysOn };
}

export {
    extractLorebookMeta
}

export type {
    LorebookMeta
}