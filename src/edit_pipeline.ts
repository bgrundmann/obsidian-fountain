import { type App, TFile } from "obsidian";
import { type Edit, applyEdits } from "./fountain";
import { parse } from "./fountain/parser";
import { FountainView } from "./views/fountain_view";

/**
 * Single programmatic-edit pipeline for fountain files. Path-keyed so
 * it works whether the file is open in any view or not.
 *
 * - When at least one FountainView is open on the file, that view's
 *   in-memory script is the source of truth (it may carry typed-but-
 *   not-yet-saved CM state). Edits are dispatched to every view as a
 *   CM transaction so cursor and undo survive, then the resulting text
 *   is written to disk.
 * - When no view is open, disk is the source of truth: read, apply,
 *   write.
 */
export async function applyEditsToFountainFile(
  app: App,
  path: string,
  edits: Edit[],
): Promise<void> {
  if (edits.length === 0) return;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    throw new Error(`Not a file: ${path}`);
  }

  const views = findFountainViewsForPath(app, path);
  const baseText =
    views.length > 0
      ? views[0].getScript().document
      : await app.vault.read(file);
  const newText = applyEdits(baseText, edits);
  const newScript = parse(newText, {});

  for (const view of views) {
    view.receiveProgrammaticEdits(edits, newScript);
  }
  await app.vault.modify(file, newText);
}

export function findFountainViewsForPath(
  app: App,
  path: string,
): FountainView[] {
  const views: FountainView[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view instanceof FountainView && leaf.view.file?.path === path) {
      views.push(leaf.view);
    }
  });
  return views;
}
