import { parse } from '../fountain_parser';
import { FountainScript } from '../fountain';
import {describe, expect, test} from '@jest/globals';

function test_script(label: string, input: string, expected: Array<Record<string, unknown>>): void {
  test(label, () => {
    const script: FountainScript = parse(input, {});
    expect(script.script).toMatchObject(expected);
  });
}

describe("Parser tests", () => {
  test_script("forced scene heading", ".A SCENE", [{ kind: 'scene'}])

  
});
