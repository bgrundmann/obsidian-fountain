import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain } from 'fountain-js';

export const VIEW_TYPE_FOUNTAIN = 'fountain';

export class FountainView extends TextFileView {
  fountain : Fountain;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.fountain = new Fountain();
  }

  getViewType() {
    return VIEW_TYPE_FOUNTAIN;
  }

  getDisplayText() {
    return 'Fountain view';
  }

  getViewData(): string {
      console.log('getViewData');
      return this.data;
  }

  setViewData(data: string, clear: boolean): void {
      console.log('setViewData %s', data);
      this.data = data;
      const script = this.fountain.parse(data, true);
      const child = this.containerEl.children[1];
      child.empty();
      const mainblock = child.createDiv('screenplay');
      // Assuming nobody does a supply chain attack on the fountain library, the below
      // is fine as there is no way for the user to embed html in the fountain.
      mainblock.innerHTML = script.html.script;
  }

  clear(): void {
      console.log('clear');
      const viewDomContent = this.containerEl.children[1];
      viewDomContent.empty();
      this.data = '';
  }
}
