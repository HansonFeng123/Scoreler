/** Language directive used by the Chinese wiki ingestion flow. */
export function buildWikiLanguageDirective(): string {
	const language = "Chinese";
	return [
		`## ⚠️ MANDATORY OUTPUT LANGUAGE: ${language}`,
		"",
		`Write surrounding natural-language prose in **${language}**.`,
		`All generated prose, including prose titles and section headings, must be in ${language}.`,
		"Do not translate, transliterate, or describe proper nouns and technical identifiers unless the source already uses a well-established localized form.",
		"Preserve organization names, product names, model names, dataset names, tool/library names, acronyms, code identifiers, file names, URLs, paper titles, citation strings, and technical terms that have no widely-used localized equivalent in their standard original form.",
		`The source material or wiki content may be in a different language; use it as evidence, but keep generated prose in ${language}.`,
		"This language rule overrides weaker style instructions, but it does not override the proper-noun and technical-identifier preservation rule above.",
	].join("\n");
}
