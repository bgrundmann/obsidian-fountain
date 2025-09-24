import {
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  autocompletion,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { FountainScript } from "./fountain";

/**
 * Pattern to match at least two characters, all uppercase letters or numbers,
 * with at least one uppercase letter (including international characters)
 */
const UPPERCASE_PATTERN = /(?=.*\p{Lu})[\p{Lu}0-9]{2,}$/u;

/**
 * Pattern to match @ symbol followed by any word characters
 */
const AT_SYMBOL_PATTERN = /@\w*$/;

/**
 * Creates a character completion source that provides autocompletion for
 * Fountain screenplay character names based on trigger patterns
 */
function createCharacterCompletionSource(
  getScript: () => FountainScript,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Check for uppercase pattern trigger
    const uppercaseMatch = context.matchBefore(UPPERCASE_PATTERN);
    const atMatch = context.matchBefore(AT_SYMBOL_PATTERN);

    const match = uppercaseMatch || atMatch;
    if (!match) {
      return null;
    }

    const script = getScript();
    if (!script || script.allCharacters.size === 0) {
      return null;
    }

    const typed = match.text;

    // Convert characters set to array and filter based on typed input
    const allCharacters = Array.from(script.allCharacters);
    const filteredCharacters = filterCharacters(allCharacters, typed);

    if (filteredCharacters.length === 0) {
      return null;
    }

    // Create completion options
    const options = filteredCharacters.map((character) => ({
      label: character,
      type: "keyword",
      apply: character,
    }));

    return {
      from: match.from,
      options,
    };
  };
}

/**
 * Filters character names based on the typed input using case-sensitive prefix matching
 */
function filterCharacters(characters: string[], searchTerm: string): string[] {
  const filtered = characters.filter((character) => {
    return character.startsWith(searchTerm);
  });

  // Sort alphabetically
  return filtered.sort((a, b) => a.localeCompare(b));
}

/**
 * Creates the character completion extension for integration with CodeMirror 6
 */
export function createCharacterCompletion(
  getScript: () => FountainScript,
): Extension {
  return autocompletion({
    activateOnTyping: true,
    override: [createCharacterCompletionSource(getScript)],
  });
}
