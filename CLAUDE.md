# Project

171819 — Shopify Online Store 2.0 theme based on Shopify's Skeleton theme.
Plain Liquid + CSS + browser JS. No framework, no build step.

# Principles

- Preserve working Shopify commerce behavior.
- Make the smallest coherent change for the requested feature.
- Read the existing implementation before editing it.
- No unrelated refactors, and no reformatting-only edits.
- Do not introduce frameworks or build tooling (React, Vue, Svelte, Vite, Webpack,
  Parcel, …) without explicit approval.
- Prefer Liquid/CSS/browser JS over new dependencies. Pin and vendor any dependency
  that is genuinely needed into `assets/`; never load it from a floating CDN URL.
- Keep page-specific assets page-specific — gate them in `layout/theme.liquid` by
  `request.page_type`, and load dependent scripts with `defer` in dependency order.
- Treat performance and accessibility as requirements, not polish.
- Keep art/animation engines separate from Shopify DOM integration. The engine says
  "I finished"; the adapter decides what the DOM does about it.
- Avoid giant utility abstractions for one-off behavior, duplicate implementations,
  and classes where functions suffice.
- Remove dead code your own changes made obsolete.
- Preserve existing public APIs unless intentionally migrating them.
- Namespace CSS; select elements via `data-` attributes rather than IDs.
- Comments explain *why*, not obvious syntax.

# Component conventions (for NEW work)

These guide new implementation — notably translating the Figma. Do not mechanically
migrate existing working code to comply.

- Sections = page-level, merchant-customizable modules. Theme blocks = reusable,
  nestable customizable content. Snippets = reusable fragments the theme editor
  never sees. JSON templates compose sections; `layout/theme.liquid` stays a thin shell.
- Component-specific CSS and JS live with their section/block via `{% stylesheet %}`
  and `{% javascript %}`, not in a growing global bundle.
- `assets/critical.css` stays small: genuinely critical, shared, global CSS only.
- Render initial page content in Liquid/HTML; do not reconstruct it in JS.
- Avoid large global JS bundles. Serve assets through Shopify's CDN via `asset_url`.

# Protected commerce areas

Do not alter any of the following unless the user specifically asks for that area:

- product variant logic, add-to-cart, cart behavior, checkout links
- pricing, inventory, localization
- customer/account functionality, Shopify forms
- `sections/product.liquid`, `sections/cart.liquid`, `sections/collection.liquid`,
  `sections/search.liquid`
- `templates/product*.json`, `templates/collection*.json`, `templates/cart.json`
- Shopify-generated objects and routes

These files may be read to understand theme architecture. Editing them is a separate,
explicitly requested task.

A full-viewport overlay must be gated on `request.design_mode` so it never traps
merchants in the Shopify Theme Editor.

# Validation

After code changes:

- run `shopify theme check`
- run `git diff --check`
- inspect the full `git diff`
- report validation results, distinguishing pre-existing failures from new ones
- never silently ignore a validation failure

# Git

- Never discard user work: no `git reset --hard`, `git checkout -- .`, `git restore .`,
  `git clean`, or force push.
- Do not commit or push without explicit instruction.

# Feature notes

**Flock intro** (homepage): `assets/flock-transition.js` is the p5 animation engine
(large by nature — geometry, simulation, choreography; do not split it up or "improve"
the animation without being asked). `assets/flock-intro.js` is the small DOM adapter.
The canvas renders transparently over the real homepage; the engine dispatches
`flocktransition:complete` and the adapter removes the overlay. `assets/p5.min.js` is
vendored p5 2.3.1.
