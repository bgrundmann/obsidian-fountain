# Views as cache

## Introduction

At the moment we use a global hashtable path -> parsed fountain document (Fountain_files).  This approach has several problems:
- We don't prune elements from the cache when they are no longer needed.
- And indeed it is tricky to figure out exactly when the element is no longer needed.
- There are some bugs related to when we add elements to the cache, in particular when a file is duplicated or newly created.

## New Approach

We store the parsed fountain documents directly in the view's state. This approach has several advantages:
- It eliminates the need for a global cache.
- It simplifies the code by removing the need for a separate cache management system.

The one twist is that the same parsed fountain document can be used by multiple views.  This means that when the document is modified we need to parse
it once and then update all views that are using it, to reflect the changes. To do that we can iterate over all (fountain) views and filter them by the document's path.
