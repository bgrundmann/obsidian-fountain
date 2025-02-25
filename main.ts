import { Plugin } from 'obsidian';
import { FountainView, VIEW_TYPE_FOUNTAIN } from './view';

export default class FountainPlugin extends Plugin {
  async onload() {
  	// Register our custom view and associate it with .fountain files
    this.registerView(VIEW_TYPE_FOUNTAIN, (leaf) => new FountainView(leaf));
    this.registerExtensions(['fountain'], VIEW_TYPE_FOUNTAIN);
  }
  async onunload() {
  	// Is there a way to "unregister" the View and extensions?
  }
}

