# Exportar y publicar

Sacar la novela de Obsidian: compilada en un archivo (EPUB, DOCX, HTML, Markdown), un
archivo por capítulo, o un capítulo copiado para pegarlo en un sitio de web novels
(Webnovel, Wattpad, Royal Road, AO3...), con registro de qué capítulos ya se
publicaron.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `src/types/ManuscriptExport.ts` | Tipos: bloques, formatos, libro, preferencias y sus defaults |
| `src/utils/manuscriptExport/manuscriptBlocks.ts` | Manuscrito → bloques; quita la sintaxis de Obsidian |
| `src/utils/manuscriptExport/inlineMarkup.ts` | Cursiva, negrita y tachado de una línea → spans |
| `src/utils/manuscriptExport/chapterRenderers.ts` | Un capítulo en texto plano, HTML, Markdown o BBCode |
| `src/utils/manuscriptExport/exportBook.ts` | El libro: orden de lectura, filtro por estado, encabezados, código de idioma |
| `src/utils/manuscriptExport/bookText.ts` | Libro en un Markdown o una página HTML; XHTML y CSS compartidos con el EPUB |
| `src/utils/manuscriptExport/epubWriter.ts` | EPUB 3 (con `toc.ncx` de EPUB 2 para lectores viejos) |
| `src/utils/manuscriptExport/docxWriter.ts` | DOCX con estilos con nombre |
| `src/utils/manuscriptExport/publishing.ts` | Siguiente capítulo sin publicar y el texto a pegar |
| `src/utils/manuscriptExport/markup.ts` | Escapes de XML, HTML y Markdown |
| `src/infrastructure/storage/exportFiles.ts` | Escribe en `export/` de la novela; nombres de archivo seguros |
| `src/ui/react/features/export/` | Modales (`ExportModal`, `PublishChapterModal`), campos, carga de la novela, preferencias, ejecución y portapapeles |

Todo `src/utils/manuscriptExport/` es puro (sin Obsidian ni React) y se testea directo.
EPUB y DOCX son ZIP: los arma `fflate` (dependencia fija en 0.8.2, sin dependencias
propias, funciona en mobile).

## De manuscrito a bloques

`parseManuscript` quita frontmatter (la memoria y la nota del autor nunca salen en un
export), comentarios `%%…%%` y `<!-- -->`, embeds e imágenes, ids de bloque `^id`; de
los links deja el texto visible. Después:

- **Cada línea no vacía es un párrafo.** En Obsidian un salto simple ya se ve como
  línea nueva, así que los autores separan párrafos de las dos formas.
- `***`, `---`, `___`, `* * *`, `#`, `⁂`, `~~~` solos en una línea son cambio de escena.
  Dos seguidos, uno al principio o al final, se descartan.
- `#`..`######` son encabezados; `>` es cita.
- Un guion al inicio no es lista: en muchos idiomas es diálogo.
- Inline: `***negrita cursiva***`, `**negrita**`, `__negrita__`, `*cursiva*`, `_cursiva_`
  (no dentro de una palabra: `snake_case`), `~~tachado~~`, `==resaltado==` (queda como
  texto). `\*` escapa.
- Si el manuscrito empieza con un encabezado igual al nombre del capítulo, se quita
  (`withoutRepeatedTitle`): el export pone el suyo.

## Exportar la novela

Comando "Export novel" o botón de descarga en la cabecera del Outline (`ExportModal`).

| Opción | Valores |
|---|---|
| Output | Un archivo para toda la novela, o uno por capítulo |
| Format | Un archivo: EPUB, DOCX, HTML, Markdown. Por capítulo: texto plano, HTML, Markdown, BBCode |
| Chapter headings | "Chapter 1: Título", "Chapter 1" o solo el título; la palabra ("Capítulo") se elige |
| Scene break | Texto del cambio de escena, `* * *` por defecto |
| Chapters | Todos los que tienen texto, o desde un estado ("Revised or later") |
| Title page, Act titles | Solo un archivo |
| Start each file with the chapter heading | Solo por capítulo |

- Los capítulos sin texto nunca se exportan; la numeración cuenta solo los exportados.
- Se escribe en `<novela>/export/`: `<Título>.epub`, o
  `<Título> - chapters/01 - <Capítulo>.<ext>`. Exportar otra vez reemplaza el archivo.
- **El explorador de Obsidian no lista `.epub`, `.docx` ni `.html`** (solo muestra lo
  que sabe abrir). Por eso, al terminar, el modal muestra el resultado (`ExportResult`)
  con "Show in folder" y, si es un solo archivo, "Open" (abre en el lector o en Word).
  Usan `app.showInFolder` y `app.openWithDefaultApp` de Obsidian desktop, que no están
  en los tipos públicos: `revealExport.ts` los busca en runtime y en mobile no aparecen.
- El título es el del Novel Setup, o el nombre de la novela. El idioma del Novel Setup
  se traduce a código (`languageCode`: "Spanish" o "Español" → `es`; un código escrito
  se respeta; si no se reconoce, `und`).
- PDF: exportar a Markdown y usar "Export to PDF" de Obsidian.
- Las opciones se recuerdan **por novela** (`settings.exportPreferences[novelId]`):
  la palabra "Capítulo" y el estado mínimo son de cada libro.

### EPUB

`mimetype` va primero y sin comprimir (lo exige el formato; hay un test). Un XHTML por
capítulo, uno por título de acto y una portada opcional (fuera del índice).
`dc:identifier` es `urn:novel-writer:<id de la novela>`, estable entre exports, así
un lector lo trata como el mismo libro.

### DOCX

El formato vive en estilos con nombre (Title, Subtitle, Heading 1 para actos, Heading 2
para capítulos, Body Text con sangría, First Paragraph sin sangría después de un
encabezado o un cambio de escena, Scene Break, Quote). El autor cambia el aspecto de
todo el libro desde Word en un solo lugar. Cada acto y capítulo empieza en página nueva,
salvo el primero si no hay portada (si no, la primera página saldría en blanco).

## Publicar por capítulo

Comando "Copy chapter for publishing" o "Copy for publishing..." en el menú "⋯" del
capítulo (`PublishChapterModal`).

- Abre en el capítulo elegido o, desde el comando, en el siguiente sin publicar
  (`nextUnpublishedChapter`: el primero con manuscrito y sin fecha).
- Muestra una vista previa y las palabras (sin contar el encabezado).
- **HTML se copia como texto enriquecido y como texto plano a la vez**
  (`copyToClipboard`): un editor visual (Wattpad, Webnovel) lo pega con formato y un
  campo de texto recibe el texto. Los demás formatos se copian como texto.
- "Copy and mark as published" copia, guarda la fecha de hoy en `published_on` y pasa
  al siguiente sin publicar. "Mark as not published" la borra.

`published_on` es parte de la información del capítulo (ver
[outline.md](outline.md#información-del-capítulo)): fecha local `YYYY-MM-DD`, editable
a mano en el capítulo expandido; la fila muestra un ícono verde. No llega a los prompts;
`list_chapters` del chat sí la muestra.

## Reglas que no hay que romper

- Nada del frontmatter sale en un export.
- `export/` queda fuera de las copias para deshacer respuestas del chat
  (`novelSnapshot.ts`): una novela compilada se copiaría en cada turno.
- Todo lo que se escribe, se escribe dentro de `export/` de la novela.

Tests: `test/manuscript-export.test.cjs`.
