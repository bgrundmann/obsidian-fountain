import { CompletionContext, type Completion } from "@codemirror/autocomplete";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import {
  createLinkCompletionSource,
  type LinkCompletionCandidate,
} from "../src/codemirror/link_completion";

const CANDIDATES: LinkCompletionCandidate[] = [
  { linktext: "act-one" },
  { linktext: "act-two" },
  { linktext: "epilogue" },
  { linktext: "Big Reveal" },
  { linktext: "Cold Open" },
];

interface RunResult {
  fired: boolean;
  document: string;
  optionLabels: string[];
}

/**
 * Run the completion source against a document where the cursor is between
 * `before` and `after`. Pick the option whose label equals `pickLabel`
 * (or the first option if not given), apply it as CodeMirror would, and
 * return the resulting state.
 */
function run(
  before: string,
  after: string,
  opts: { pickLabel?: string } = {},
): RunResult {
  const doc = before + after;
  const cursor = before.length;
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, cursor, true);
  const source = createLinkCompletionSource(() => CANDIDATES);
  const result = source(ctx);

  if (result == null) {
    return { fired: false, document: doc, optionLabels: [] };
  }
  if (
    typeof result === "object" &&
    "then" in result &&
    typeof (result as { then: unknown }).then === "function"
  ) {
    throw new Error("source returned a promise; not expected in these tests");
  }
  const sync = result as {
    from: number;
    to?: number;
    options: readonly Completion[];
  };

  const from = sync.from;
  const to = sync.to ?? cursor;
  const labels = sync.options.map((o) => String(o.label));
  const pick =
    opts.pickLabel != null
      ? sync.options.find((o) => o.label === opts.pickLabel)
      : sync.options[0];
  if (!pick) throw new Error(`no option matching ${opts.pickLabel}`);

  let newState = state;
  if (typeof pick.apply === "string") {
    newState = state.update({
      changes: { from, to, insert: pick.apply },
    }).state;
  } else if (typeof pick.apply === "function") {
    // Mock the bits of EditorView the apply function uses: live `state`
    // and a `dispatch` that applies transactions to our local state.
    const view = {
      get state() {
        return newState;
      },
      dispatch(spec: TransactionSpec) {
        newState = newState.update(spec).state;
      },
    };
    // CodeMirror's signature: apply(view, completion, from, to).
    (pick.apply as (v: unknown, c: Completion, f: number, t: number) => void)(
      view,
      pick,
      from,
      to,
    );
  } else {
    throw new Error("option.apply must be a string or function");
  }

  return {
    fired: true,
    document: newState.doc.toString(),
    optionLabels: labels,
  };
}

describe("link completion", () => {
  describe("fresh insertion (no closing ]] yet)", () => {
    it("offers candidates after `[[>` with empty filter", () => {
      const r = run("Action with [[>", "");
      expect(r.fired).toBe(true);
      expect(r.optionLabels).toEqual([
        "act-one",
        "act-two",
        "Big Reveal",
        "Cold Open",
        "epilogue",
      ]);
      expect(r.document).toBe("Action with [[>act-one]]");
    });

    it("filters by typed prefix and appends `]]`", () => {
      const r = run("See [[>act", "");
      expect(r.fired).toBe(true);
      expect(r.optionLabels).toEqual(["act-one", "act-two"]);
      expect(r.document).toBe("See [[>act-one]]");
    });

    it("does not fire outside a `[[>` prefix", () => {
      const r = run("just some text ", "");
      expect(r.fired).toBe(false);
    });
  });

  describe("editing an existing link", () => {
    it("replaces stale linktext when cursor is between `>` and existing name", () => {
      const r = run("See [[>", "act-one]] later", { pickLabel: "act-two" });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("See [[>act-two]] later");
    });

    it("replaces a partially-typed name and consumes the existing ]]", () => {
      const r = run("See [[>ep", "oldname]] later", { pickLabel: "epilogue" });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("See [[>epilogue]] later");
    });

    it("strips an existing |alias when picking a new target", () => {
      const r = run("Go to [[>", "foo|My Display]] now", {
        pickLabel: "act-one",
      });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("Go to [[>act-one]] now");
    });

    it("does not consume an unrelated [[link]] later on the same line", () => {
      const r = run("[[>act", " some more [[Another]]", {
        pickLabel: "act-two",
      });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("[[>act-two]] some more [[Another]]");
    });

    it("does not fire when the cursor is inside the alias segment", () => {
      const r = run("[[>foo|My D", "isplay]]");
      expect(r.fired).toBe(false);
    });
  });

  describe("linktext with spaces", () => {
    it("inserts a candidate whose name contains a space", () => {
      const r = run("See [[>Big", "", { pickLabel: "Big Reveal" });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("See [[>Big Reveal]]");
    });

    it("filters when typed prefix spans a space", () => {
      const r = run("See [[>Cold O", "");
      expect(r.fired).toBe(true);
      expect(r.optionLabels).toEqual(["Cold Open"]);
      expect(r.document).toBe("See [[>Cold Open]]");
    });

    it("replaces an existing space-containing linktext", () => {
      const r = run("See [[>", "Old Name]] later", {
        pickLabel: "Big Reveal",
      });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("See [[>Big Reveal]] later");
    });

    it("strips alias and replaces space-containing linktext", () => {
      const r = run("See [[>", "Old Name|Display Text]] now", {
        pickLabel: "Cold Open",
      });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("See [[>Cold Open]] now");
    });
  });

  describe("nesting / proximity", () => {
    it("anchors at the most recent `[[>` when an earlier one is unclosed", () => {
      const r = run("[[>foo [[>act", "", { pickLabel: "act-two" });
      expect(r.fired).toBe(true);
      expect(r.document).toBe("[[>foo [[>act-two]]");
    });
  });

  // Regression: when the cursor sits inside a closed `[[>partial]]` and the
  // user types another character, the popup must still appear. CodeMirror
  // builds the fuzzy-match filter pattern from `state.sliceDoc(from, to)` —
  // so `to` must not extend past the cursor or the pattern picks up `]]`
  // (or stale linktext) and rejects every candidate.
  describe("filter pattern stays at the cursor", () => {
    function rawResult(before: string, after: string) {
      const doc = before + after;
      const cursor = before.length;
      const state = EditorState.create({ doc });
      const ctx = new CompletionContext(state, cursor, true);
      const source = createLinkCompletionSource(() => CANDIDATES);
      const r = source(ctx);
      return { result: r, cursor };
    }

    it("result.to is undefined (defaults to cursor) for an open link", () => {
      const { result, cursor } = rawResult("See [[>act", "");
      expect(result).not.toBeNull();
      const sync = result as { to?: number; from: number };
      expect(sync.to ?? cursor).toBe(cursor);
    });

    it("result.to is undefined when the cursor is inside [[>partial]]", () => {
      // The user has `[[>Flavor and E]]` and the cursor sits between `E` and
      // `]]`. With my earlier (broken) fix this would set `to` past the
      // closing brackets and the popup would not appear.
      const { result, cursor } = rawResult(
        "= synopsis [[>act",
        "ress ]] tail",
      );
      expect(result).not.toBeNull();
      const sync = result as { to?: number; from: number };
      expect(sync.to ?? cursor).toBe(cursor);
    });

    it("result.to is undefined when the cursor is inside [[>foo|alias]]", () => {
      const { result, cursor } = rawResult(
        "Go to [[>act",
        "ress|My Display]] now",
      );
      expect(result).not.toBeNull();
      const sync = result as { to?: number; from: number };
      expect(sync.to ?? cursor).toBe(cursor);
    });
  });
});
