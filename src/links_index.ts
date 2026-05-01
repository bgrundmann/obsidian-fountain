import {
  type App,
  type Debouncer,
  type EventRef,
  TFile,
  debounce,
} from "obsidian";
import { applyEditsToFountainFile } from "./edit_pipeline";
import {
  type Edit,
  extractLinks,
  parseLinkContent,
  targetRefersTo,
} from "./fountain";
import { parse } from "./fountain/parser";

const FOUNTAIN_EXT = "fountain";

/**
 * In-memory index of `[[>...]]` links across all `.fountain` files.
 *
 * The index is a coarse `targetPath -> Set<sourceFountainPath>` lookup used
 * to answer "which files might reference target X?" for rename rewriting.
 * Ranges and literal targets are not cached — the parser recomputes them on
 * demand against the current file content, so the index can never go stale
 * relative to typed-but-unsaved editor state.
 *
 * Only currently-resolved references are indexed; unresolved targets are
 * lit up at render time by `getFirstLinkpathDest`.
 */
export class LinkIndex {
  private byTarget = new Map<string, Set<string>>();
  private bySource = new Map<string, Set<string>>();
  private eventRefs: EventRef[] = [];
  private fullRebuild: Debouncer<[], void>;

  constructor(private app: App) {
    this.fullRebuild = debounce(() => this.rebuildAll(), 250, true);
  }

  /** Initial scan; safe to call from `onLayoutReady`. */
  initialize(): void {
    this.rebuildAll();
    this.attachVaultListeners();
  }

  /** Detach event listeners. Call from plugin `onunload`. */
  dispose(): void {
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.byTarget.clear();
    this.bySource.clear();
  }

  /** Set of fountain file paths that resolve a link to `targetPath`. */
  referencesTo(targetPath: string): Set<string> {
    return this.byTarget.get(targetPath) ?? new Set();
  }

  private attachVaultListeners(): void {
    const v = this.app.vault;
    this.eventRefs.push(
      v.on("modify", (file) => {
        if (file instanceof TFile && file.extension === FOUNTAIN_EXT) {
          this.refreshFile(file);
        }
      }),
      v.on("create", (file) => {
        // A new file can shift shortest-unique-path resolutions in *other*
        // fountain files, so rebuild fully (debounced).
        if (file instanceof TFile) this.fullRebuild();
      }),
      v.on("delete", (file) => {
        if (file instanceof TFile) this.fullRebuild();
      }),
      v.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        // Rewrite outgoing `[[>...]]` notes that pointed at oldPath, then
        // refresh the index for the renamed file.
        this.handleTargetRename(file, oldPath).catch((err) => {
          console.error("links: rename rewrite failed", err);
        });
      }),
    );
  }

  /** Rebuild the entire index from scratch. */
  private rebuildAll(): void {
    this.byTarget.clear();
    this.bySource.clear();
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== FOUNTAIN_EXT) continue;
      this.app.vault
        .cachedRead(file)
        .then((text) => this.indexFromText(file.path, text))
        .catch(() => {
          // Read failures are expected during rapid file system churn.
        });
    }
  }

  private async refreshFile(file: TFile): Promise<void> {
    const text = await this.app.vault.cachedRead(file);
    this.indexFromText(file.path, text);
  }

  private indexFromText(sourcePath: string, text: string): void {
    this.removeSource(sourcePath);
    const script = parse(text, {});
    const newTargets = new Set<string>();
    for (const note of extractLinks(script.script)) {
      const content = text.slice(note.textRange.start, note.textRange.end);
      const { target } = parseLinkContent(content);
      if (target.length === 0) continue;
      const dst = this.app.metadataCache.getFirstLinkpathDest(
        target,
        sourcePath,
      );
      if (!dst) continue;
      newTargets.add(dst.path);
      this.addEntry(dst.path, sourcePath);
    }
    if (newTargets.size > 0) {
      this.bySource.set(sourcePath, newTargets);
    }
  }

  private removeSource(sourcePath: string): void {
    const oldTargets = this.bySource.get(sourcePath);
    if (!oldTargets) return;
    for (const target of oldTargets) {
      const refs = this.byTarget.get(target);
      if (!refs) continue;
      refs.delete(sourcePath);
      if (refs.size === 0) this.byTarget.delete(target);
    }
    this.bySource.delete(sourcePath);
  }

  private addEntry(targetPath: string, sourcePath: string): void {
    let refs = this.byTarget.get(targetPath);
    if (!refs) {
      refs = new Set();
      this.byTarget.set(targetPath, refs);
    }
    refs.add(sourcePath);
  }

  private async handleTargetRename(
    file: TFile,
    oldPath: string,
  ): Promise<void> {
    // 1. Find fountain files that referenced oldPath via index lookup.
    const referers = Array.from(this.referencesTo(oldPath));

    // 2. Rewrite each referring file's link notes that resolve to the
    //    renamed file. Use fileToLinktext to preserve the user's chosen
    //    "with/without extension, basename vs path" form.
    for (const sourcePath of referers) {
      await this.rewriteLinksInFile(sourcePath, oldPath, file);
    }

    // 3. Re-index the renamed file itself (its own outgoing links may
    //    have had their resolution shift). The shortest-path resolution of
    //    other files may also shift, so do a debounced full rebuild.
    if (file.extension === FOUNTAIN_EXT) {
      this.removeSource(oldPath);
      await this.refreshFile(file);
    }
    this.fullRebuild();
  }

  private async rewriteLinksInFile(
    sourcePath: string,
    oldTargetPath: string,
    newTarget: TFile,
  ): Promise<void> {
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile)) return;

    // The rename event fires after metadataCache has been updated, so
    // re-resolving the literal target via getFirstLinkpathDest no longer
    // returns oldTargetPath. Match the target text directly against the
    // old path instead — the index already narrowed us to files that had
    // at least one link resolving to oldTargetPath.
    const text = await this.app.vault.cachedRead(sourceFile);
    const script = parse(text, {});

    const edits: Edit[] = [];
    for (const note of extractLinks(script.script)) {
      const content = text.slice(note.textRange.start, note.textRange.end);
      const { target, displayText } = parseLinkContent(content);
      if (target.length === 0) continue;
      if (!targetRefersTo(target, oldTargetPath)) continue;
      const newLinktext = this.app.metadataCache.fileToLinktext(
        newTarget,
        sourcePath,
      );
      const replacement =
        displayText !== null ? `${newLinktext}|${displayText}` : newLinktext;
      edits.push({ range: note.textRange, replacement });
    }
    if (edits.length === 0) return;
    await applyEditsToFountainFile(this.app, sourcePath, edits);
  }
}
