import * as yaml from 'js-yaml';
import { App, TFile, TFolder } from 'obsidian';
import type { WriterAIPluginSettings } from '../../main';
import { extractValueFromFrontmatter } from './frontmatter';

/**
 * Busca un archivo _config.md en una carpeta
 */
async function findConfigFile(folder: TFolder): Promise<TFile | null> {
    const configFile = folder.children.find(
        (child) => child instanceof TFile && child.name === '_config.md'
    ) as TFile | undefined;
    return configFile || null;
}

/**
 * Busca un valor de forma cascada:
 * 1. Frontmatter de la nota actual
 * 2. Frontmatter de _config.md en la carpeta actual y carpetas padres
 * 3. Configuración global del plugin
 */
async function getPromptMetaCascading(
    app: App,
    settings: WriterAIPluginSettings,
    key: keyof WriterAIPluginSettings
): Promise<string> {
    // 1. Buscar en frontmatter de la nota actual
    const activeFile = app.workspace.getActiveFile();
    if (activeFile) {
        const content = await app.vault.read(activeFile);
        const value = extractValueFromFrontmatter(content, key);
        if (value) return value;
        
        // 2. Buscar en _config.md de la carpeta actual y carpetas padres
        let currentFolder = activeFile.parent;
        while (currentFolder) {
            const configFile = await findConfigFile(currentFolder);
            if (configFile) {
                const configContent = await app.vault.read(configFile);
                const configValue = extractValueFromFrontmatter(configContent, key);
                if (configValue) return configValue;
            }
            currentFolder = currentFolder.parent;
        }
    }
    
    // 3. Buscar en configuración global del plugin
    if (typeof settings[key] === 'string') {
        return settings[key];
    }
    
    return '';
}

export {
    getPromptMetaCascading
}