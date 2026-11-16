/**
 * Function words left out of the "most used words" list of the Metrics tab.
 * Spanish and English, written without accents: the lookup strips accents
 * first, so "está" and "esta" both match.
 */

const SPANISH = [
	'a', 'al', 'algo', 'alguien', 'algun', 'alguna', 'algunas', 'alguno',
	'algunos', 'ante', 'antes', 'aqui', 'asi', 'aun', 'aunque', 'bajo', 'bien',
	'cada', 'casi', 'como', 'con', 'contra', 'cual', 'cuales', 'cuando',
	'cuanto', 'de', 'del', 'desde', 'donde', 'dos', 'e', 'el', 'ella', 'ellas',
	'ello', 'ellos', 'en', 'entonces', 'entre', 'era', 'eran', 'eres', 'es',
	'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estaba', 'estaban', 'estado',
	'estar', 'estas', 'este', 'esto', 'estos', 'estoy', 'fue', 'fueron', 'ha',
	'habia', 'habian', 'han', 'hasta', 'hay', 'he', 'la', 'las', 'le', 'les',
	'lo', 'los', 'luego', 'mas', 'me', 'mi', 'mis', 'mientras', 'mismo', 'mucho',
	'muy', 'nada', 'ni', 'no', 'nos', 'nosotros', 'nunca', 'o', 'os', 'otra',
	'otras', 'otro', 'otros', 'para', 'pero', 'poco', 'por', 'porque', 'pues',
	'que', 'quien', 'se', 'sea', 'ser', 'si', 'sido', 'siempre', 'sin', 'sino',
	'so', 'sobre', 'solo', 'son', 'soy', 'su', 'sus', 'tal', 'tambien', 'tan',
	'tanto', 'te', 'tenia', 'ti', 'tiene', 'todo', 'todos', 'tras', 'tu', 'tus',
	'u', 'un', 'una', 'unas', 'uno', 'unos', 'usted', 'ustedes', 'vez', 'y',
	'ya', 'yo',
];

const ENGLISH = [
	'a', 'about', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
	'at', 'be', 'been', 'before', 'being', 'but', 'by', 'can', 'could', 'did',
	'do', 'does', 'down', 'for', 'from', 'had', 'has', 'have', 'he', 'her',
	'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
	'just', 'me', 'more', 'my', 'no', 'not', 'now', 'of', 'off', 'on', 'one',
	'only', 'or', 'our', 'out', 'over', 'she', 'so', 'some', 'than', 'that',
	'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'too', 'up',
	'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
	'will', 'with', 'would', 'you', 'your',
];

export const STOPWORDS: ReadonlySet<string> = new Set([...SPANISH, ...ENGLISH]);
