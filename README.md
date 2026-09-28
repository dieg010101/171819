# 171819

Custom Shopify Online Store 2.0 theme.

## Development

Requirements:

- Shopify CLI
- Git

Commands:

```sh
shopify theme dev     # local preview against the store
shopify theme check   # lint Liquid, JSON and theme conventions
```

## Architecture

The theme started from Shopify's [Skeleton theme](https://github.com/Shopify/skeleton-theme)
and keeps its standard Online Store 2.0 directory layout. Upstream demo content and
contributor documentation have been removed; `LICENSE.md` is retained because the theme
is derived from Skeleton.

- **JSON templates** (`templates/*.json`) compose a page out of sections. They are
  auto-generated and may be rewritten by the theme editor, so avoid hand-editing them
  beyond changing which sections a page uses.
- **Sections** (`sections/*.liquid`) are page-level, merchant-customizable modules.
  `header-group.json` and `footer-group.json` are section groups rendered by the layout
  on every page.
- **Blocks** (`blocks/*.liquid`) are reusable, nestable content units. `group` and `text`
  are generic building blocks that any section accepting `@theme` blocks can use.
- **Snippets** (`snippets/*.liquid`) are reusable Liquid fragments, invisible to the
  theme editor — e.g. `image`, `meta-tags`, `css-variables`.
- **`layout/theme.liquid`** is a thin site shell: head, section groups, and
  `content_for_layout`.
- **`assets/critical.css`** is the only global stylesheet. It holds the CSS reset, the
  `.shopify-section` layout grid, and the flock intro shell — nothing else. Component
  styles belong with their component.
- **`snippets/css-variables.liquid`** turns theme settings (font, page width, colors,
  input radius) into CSS custom properties on `:root`.

### Flock intro

A full-viewport p5.js bird animation that covers the real homepage on first load, then
becomes transparent to reveal it. Homepage-only, and disabled in the theme editor.

| File | Role |
| --- | --- |
| `assets/p5.min.js` | Vendored, pinned p5.js 2.3.3. Never loaded from a CDN. |
| `assets/flock-transition.js` | The animation engine: bird geometry, flight simulation, choreography. Large by nature. Dispatches `flocktransition:complete`. |
| `assets/flock-intro.js` | Small DOM adapter: mounts, isolates the page, removes the overlay on completion. |
| `snippets/flock-intro.liquid` | Minimal semantic shell: canvas mount plus an accessible trigger button. |

The engine says "I finished"; the adapter decides what the DOM does about it. Scripts load
`defer` in dependency order from `layout/theme.liquid`, gated on
`request.page_type == 'index'` and `request.design_mode != true`.

## Development conventions

- Figma is the visual source of truth.
- Preserve Shopify commerce behavior (products, variants, cart, checkout, customers).
- Reach for Liquid/HTML/CSS first; add JavaScript only for genuine interaction.
- Render initial page content in Liquid, not reconstructed in JS.
- Component-specific CSS and JS belong with the section/block via `{% stylesheet %}` and
  `{% javascript %}`, not in a growing global bundle.
- `critical.css` stays small — genuinely critical, shared CSS only.
- Page-specific scripts stay page-specific, gated by `request.page_type`.
- No build system, no framework.

## Validation

```sh
shopify theme check
git diff --check
```

See `CLAUDE.md` for the full working rules, including protected commerce areas.
