import type { FountainScript } from "./fountain";
import * as fountain_parser from "./fountain_parser";
export { parse };

type ParseError = {
  error: unknown;
};

// TODO: Add cache expiration.
// Cache storage using Map with path as key and cached result as value
const parseCache = new Map<
  string,
  {
    document: string;
    result: FountainScript | ParseError;
  }
>();

function parse(path: string, input: string): FountainScript | ParseError {
  // Check if we have a cached result for this path
  const cached = parseCache.get(path);

  // If cache exists and input matches cached document, return cached result
  if (cached && cached.document === input) {
    console.log("cache saved work", path);
    return cached.result;
  }

  // Otherwise parse the input and cache the result
  try {
    console.log("cache did not save work", path);
    const result = fountain_parser.parse(input);
    parseCache.set(path, {
      document: input,
      result: result,
    });
    return result;
  } catch (e) {
    const error = { error: e };
    parseCache.set(path, {
      document: input,
      result: error,
    });
    return error;
  }
}
