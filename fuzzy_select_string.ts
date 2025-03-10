import { type App, FuzzySuggestModal } from "obsidian";

export class FuzzySelectString extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    title: string,
    private items: string[],
    private callback: (item: string) => void,
  ) {
    super(app);
    this.setTitle(title);
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    this.callback(item);
  }
}
