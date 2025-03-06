import type { FountainScript } from "./fountain";
import * as fountain_parser from "./fountain_parser";
export { parse };

type ParseError = {
  error: unknown;
};

function parse(input: string): FountainScript | ParseError {
  try {
    return fountain_parser.parse(input);
  } catch (e) {
    return { error: e };
  }
}
