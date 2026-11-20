import type { EntradaCodex } from '../domain';
import type { NameCandidate } from '../types/NovelMetrics';
import { STOPWORDS } from '../constants/stopwords';
import { stripAccents } from './codexMentions';
import { splitParagraphs, splitSentences } from './textStats';

/**
 * Proper names in the manuscript that have no codex entry. Local and pure:
 * no AI. A name is a capitalized word (or a run of them, "Port Vey", "Juan de
 * la Cruz") that appears capitalized in the middle of a sentence; what starts
 * a sentence or a line of dialogue proves nothing on its own.
 */

/** Fewest appearances for a name to be suggested. */
export const MIN_NAME_MENTIONS = 3;

/** Longest run of words taken as one name. Longer ones are titles or shouting. */
const MAX_NAME_WORDS = 4;

/**
 * Lowercase words allowed inside a name: "Juan de la Cruz", "Isle of Mists".
 * Not "y" or "and": "Kael y Marta" are two names.
 */
const CONNECTORS = new Set([
	'de', 'del', 'la', 'las', 'los', 'el', 'of', 'the', 'von', 'van', 'da', 'di',
	'du', 'le',
]);

/** Words before a name that are not part of it: "Señor Kael" is Kael. */
const TITLES = new Set([
	'senor', 'senora', 'senorita', 'don', 'dona', 'sir', 'lady', 'lord', 'mr',
	'mrs', 'ms', 'miss', 'dr', 'doctor', 'doctora', 'capitan', 'capitana',
	'captain', 'rey', 'reina', 'king', 'queen', 'principe', 'princesa',
	'prince', 'princess', 'fray', 'sor', 'tio', 'tia', 'uncle', 'aunt',
]);

/** Capitalized in English but not names. */
const CALENDAR = new Set([
	'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
	'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
	'september', 'october', 'november', 'december', 'lunes', 'martes',
	'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero',
	'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
	'octubre', 'noviembre', 'diciembre',
]);

const TOKEN = /\p{L}+(?:['’]\p{L}+)*/gu;

/** Between two tokens: what makes the next one start a sentence or a line. */
const OPENS_CLAUSE = /[—–"“«¿¡(:]|--/;

export interface NameCandidateChapter {
	/** Place in reading order (1 = first). */
	number: number;
	/** Text already cleaned of Markdown (`cleanMarkdown`). */
	text: string;
}

export interface NameCandidateInput {
	chapters: NameCandidateChapter[];
	/** Every entry, archived and hidden ones too: they already exist. */
	entries: EntradaCodex[];
	/** Names the author chose to ignore, as written. */
	ignored: string[];
}

export function normalizeName(value: string): string {
	return stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

interface Token {
	text: string;
	/** Starts a sentence or a line of dialogue. */
	initial: boolean;
	/** Only spaces since the previous token: they may form one name. */
	joined: boolean;
}

function tokensOf(sentence: string): Token[] {
	const tokens: Token[] = [];
	let previousEnd = -1;
	for (const match of sentence.matchAll(TOKEN)) {
		const start = match.index ?? 0;
		const gap = sentence.slice(Math.max(0, previousEnd), start);
		tokens.push({
			text: match[0],
			initial: previousEnd < 0 || OPENS_CLAUSE.test(gap),
			joined: previousEnd >= 0 && /^\s+$/.test(gap),
		});
		previousEnd = start + match[0].length;
	}
	return tokens;
}

function isCapitalized(word: string): boolean {
	const first = word[0];
	if (first === first.toLowerCase()) return false;
	// "OK", "NO": shouting or acronyms, not names to suggest.
	return !(word.length > 1 && word === word.toUpperCase());
}

function isCommonWord(word: string): boolean {
	const key = normalizeName(word);
	return STOPWORDS.has(key) || TITLES.has(key) || CALENDAR.has(key);
}

/** Runs of capitalized words, joined by connectors, as candidate names. */
function nameRuns(tokens: Token[]): Token[][] {
	const runs: Token[][] = [];
	let index = 0;
	while (index < tokens.length) {
		if (!isCapitalized(tokens[index].text) || tokens[index].text.length < 2) {
			index++;
			continue;
		}
		const run = [tokens[index]];
		let next = index + 1;
		while (next < tokens.length && tokens[next].joined && !tokens[next].initial) {
			const word = tokens[next].text;
			if (isCapitalized(word)) {
				run.push(tokens[next]);
				next++;
				continue;
			}
			// A connector only belongs to the name when a capital follows it.
			let ahead = next;
			while (ahead < tokens.length && CONNECTORS.has(tokens[ahead].text)
				&& tokens[ahead].joined) {
				ahead++;
			}
			if (ahead === next || ahead >= tokens.length || !tokens[ahead].joined
				|| !isCapitalized(tokens[ahead].text)) {
				break;
			}
			run.push(...tokens.slice(next, ahead + 1));
			next = ahead + 1;
		}
		runs.push(run);
		index = next;
	}
	return runs;
}

/** Leading titles and words that only start the sentence ("Cuando Marta"). */
function trimRun(run: Token[]): Token[] {
	let start = 0;
	while (start < run.length - 1 && isCommonWord(run[start].text)) start++;
	let end = run.length;
	while (end > start && CONNECTORS.has(run[end - 1].text)) end--;
	return run.slice(start, end);
}

interface Tally {
	key: string;
	forms: Map<string, number>;
	mentions: number;
	/** Appearances in the middle of a sentence: the proof it is a name. */
	midSentence: number;
	chapters: Set<number>;
	firstChapter: number;
	example: string;
}

function record(
	tallies: Map<string, Tally>,
	words: Token[],
	initial: boolean,
	chapter: number,
	sentence: string,
): void {
	if (!words.length || words.length > MAX_NAME_WORDS) return;
	if (words.length === 1 && isCommonWord(words[0].text)) return;
	const form = words.map((token) => token.text).join(' ');
	const key = normalizeName(form);
	let tally = tallies.get(key);
	if (!tally) {
		tally = {
			key,
			forms: new Map(),
			mentions: 0,
			midSentence: 0,
			chapters: new Set(),
			firstChapter: chapter,
			example: '',
		};
		tallies.set(key, tally);
	}
	tally.forms.set(form, (tally.forms.get(form) ?? 0) + 1);
	tally.mentions++;
	tally.chapters.add(chapter);
	if (!initial) {
		tally.midSentence++;
		if (!tally.example) tally.example = sentence.trim();
	}
}

interface CodexTerms {
	terms: Set<string>;
	/** Words of each name or alias. */
	words: Set<string>[];
}

/**
 * Names and aliases of the entries, split on any sign: "Dr. Stein" is
 * "dr stein" and "R0X4N3 (Roxane)" has the word "roxane".
 */
function entryTerms(entries: EntradaCodex[]): CodexTerms {
	const terms = new Set<string>();
	const words: Set<string>[] = [];
	for (const entry of entries) {
		const names = [entry.nombre, ...(entry.alias ?? '').split(',')];
		for (const name of names) {
			const parts = normalizeName(name ?? '')
				.split(/[^\p{L}\p{N}']+/u)
				.filter(Boolean);
			if (!parts.length) continue;
			terms.add(parts.join(' '));
			words.push(new Set(parts));
		}
	}
	return { terms, words };
}

/** Already in the codex: a name or alias, or part of one ("Elena" of "Elena Vargas"). */
function hasEntry(key: string, codex: CodexTerms): boolean {
	if (codex.terms.has(key)) return true;
	const parts = key.split(' ');
	return codex.words.some((words) => parts.every((part) => words.has(part)));
}

function mostCommonForm(forms: Map<string, number>): string {
	return [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** "...the Old Tower stood..." around the name, at most about 140 characters. */
function shortExample(sentence: string, name: string): string {
	if (sentence.length <= 140) return sentence;
	const at = Math.max(0, sentence.indexOf(name));
	const start = Math.max(0, at - 60);
	const end = Math.min(sentence.length, at + name.length + 60);
	return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}`
		+ `${end < sentence.length ? '…' : ''}`;
}

/** Contained in a bigger name that appears at least as often ("Vey" of "Port Vey"). */
function partOfBiggerName(tally: Tally, accepted: Tally[]): boolean {
	const padded = ` ${tally.key} `;
	return accepted.some((other) => other !== tally
		&& ` ${other.key} `.includes(padded)
		&& other.mentions >= tally.mentions);
}

/**
 * Names without an entry, most mentioned first. Each needs at least
 * `MIN_NAME_MENTIONS` appearances, one of them mid-sentence, and must not be a
 * word the text also uses in lowercase as often ("Rey" and "rey").
 */
export function findNameCandidates(input: NameCandidateInput): NameCandidate[] {
	const tallies = new Map<string, Tally>();
	const lowercase = new Map<string, number>();
	for (const chapter of input.chapters) {
		for (const paragraph of splitParagraphs(chapter.text)) {
			for (const sentence of splitSentences(paragraph)) {
				const tokens = tokensOf(sentence);
				for (const token of tokens) {
					if (isCapitalized(token.text)) continue;
					const key = normalizeName(token.text);
					lowercase.set(key, (lowercase.get(key) ?? 0) + 1);
				}
				for (const run of nameRuns(tokens)) {
					const words = trimRun(run);
					const initial = words[0] === run[0] && run[0].initial;
					record(tallies, words, initial, chapter.number, sentence);
					// "Mañana Marta dijo": Marta counts even if "Mañana Marta" doesn't.
					if (initial && words.length > 1) {
						const rest = trimRun(words.slice(1));
						record(tallies, rest, false, chapter.number, sentence);
					}
				}
			}
		}
	}

	const codex = entryTerms(input.entries);
	const ignored = new Set(input.ignored.map(normalizeName));
	const accepted = [...tallies.values()].filter((tally) => {
		if (tally.mentions < MIN_NAME_MENTIONS || tally.midSentence === 0) return false;
		if (ignored.has(tally.key) || hasEntry(tally.key, codex)) return false;
		const single = !tally.key.includes(' ');
		return !(single && (lowercase.get(tally.key) ?? 0) >= tally.midSentence);
	});
	return accepted
		.filter((tally) => !partOfBiggerName(tally, accepted))
		.map((tally): NameCandidate => {
			const name = mostCommonForm(tally.forms);
			return {
				name,
				mentions: tally.mentions,
				chapters: tally.chapters.size,
				firstChapter: tally.firstChapter,
				example: shortExample(tally.example, name),
			};
		})
		.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}
