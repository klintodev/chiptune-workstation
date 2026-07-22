# PRD 18: Production Loading and Asset Build

## Description

Prevent the workstation from briefly showing a white, unstyled document while its styles load, and introduce a small production build that serves fewer and smaller files. Source code remains organised by feature for development; the deployed site receives bundled, minified, fingerprinted JavaScript and CSS.

## Requirements

- Paint the Klinto dark background immediately from a small inline critical style in each HTML document.
- Keep page content hidden only until its render-blocking stylesheet is ready, with a short fallback reveal if that stylesheet fails.
- Keep functional styles colocated with their features while exposing one CSS entry point per page.
- Bundle and minify the workstation JavaScript into one production asset.
- Bundle and minify the workstation CSS, including styles for dynamically created account, export, sharing, and visualiser interfaces.
- Produce independent JavaScript and CSS bundles for the public player page.
- Add content hashes to generated filenames so immutable browser caching is safe.
- Copy brand assets, the web manifest, `robots.txt`, and `sitemap.xml` into the production directory.
- Generate the production HTML with references to the fingerprinted bundles.
- Keep Firebase HTML responses uncached while caching fingerprinted JavaScript and CSS for one year.
- Build before automated checks and before Firebase preview or live deployment.
- Do not commit generated build output.

## Open questions

- A service worker is intentionally excluded until offline editing has a clear update and cache-invalidation experience.
- Fonts remain hosted by Google for this iteration; self-hosting can be considered if font delivery becomes a measured bottleneck.
- Source maps are omitted from the public build for now and can be enabled later if production debugging requires them.

## E61: Stable first paint

- Add minimal inline background, foreground, and visibility rules before external resources.
- Make the full stylesheet explicitly reveal the page.
- Apply the same protection to the workstation and public player.

## E62: Bundled production assets

- Add a minimal esbuild-based production script.
- Consolidate feature CSS into the workstation stylesheet entry point.
- Emit minified and fingerprinted page bundles into `dist`.
- Rewrite generated HTML to the emitted asset names.

## E63: Build-aware hosting

- Serve Firebase Hosting from `dist`.
- Add immutable caching for generated JavaScript and CSS.
- Install dependencies and run the build in CI before deploying.
- Add focused checks for critical CSS and deployment configuration.
