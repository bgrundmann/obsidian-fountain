#!/usr/bin/env bash
set -euo pipefail

# --- Parse the latest changelog entry ---

# Extract version and title from the first ## [x.y.z] - Title line
changelog_header=$(grep -m1 '^## \[' CHANGELOG.md)
if [[ ! "$changelog_header" =~ ^##\ \[([0-9]+\.[0-9]+\.[0-9]+)\]\ -\ (.+)$ ]]; then
  echo "Error: Could not parse version from CHANGELOG.md header: $changelog_header"
  exit 1
fi
version="${BASH_REMATCH[1]}"
title="${BASH_REMATCH[2]}"

# Extract the body (everything between first and second ## header, excluding the header itself)
body=$(awk '/^## \[/{if(n++){exit}else{next}}n' CHANGELOG.md)

# --- Check if this release already exists on GitHub ---

if gh release view "$version" &>/dev/null; then
  echo "Error: Release $version already exists on GitHub."
  exit 1
fi

# --- Show what we're about to do and ask for confirmation ---

current_version=$(node -p "require('./package.json').version")

echo "About to release:"
echo ""
echo "  Version: $version - $title"
if [[ "$current_version" != "$version" ]]; then
  echo "  npm version: $current_version -> $version"
fi
echo ""
echo "$body"
echo ""
read -p "Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# --- Bump version if needed ---

if [[ "$current_version" != "$version" ]]; then
  echo "Running npm version $version..."
  npm version "$version"
fi

# --- Ensure everything is pushed ---

echo "Pushing to origin..."
git push

# --- Build ---

echo "Building..."
npm run build

# --- Create the GitHub release ---

echo "Creating GitHub release $version..."
gh release create "$version" \
  --title "$version - $title" \
  --notes "$body" \
  --latest \
  main.js styles.css manifest.json

echo ""
echo "Release $version created successfully!"
