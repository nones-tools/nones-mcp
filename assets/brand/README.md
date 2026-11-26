# Brand assets

The pixel octopus is the Nones Tools brand mark. All artwork here is
in-repo, raster-friendly, and safe to embed in GitHub and npm READMEs.

| File | Purpose |
| --- | --- |
| `nones-tools-avatar.png` | Canonical 500 × 500 pixel octopus. Source of truth for the avatar. |
| `banner-nones-mcp.svg` / `.png` | Root README banner for the Nones MCP monorepo |
| `../../apps/kaiten/docs/assets/banner.svg` / `.png` | Kaiten MCP banner |
| `../../apps/opencode/docs/assets/banner.svg` / `.png` | OpenCode MCP banner |

## Rendering rules

- Banners are 1200 × 320. Keep the shared layout: octopus card on the left,
  title, one-line description, feature rule and package/repository footer.
- The SVGs are self-contained. The octopus is embedded as a base64 `data:`
  image, and there are no external images, fonts, stylesheets or scripts.
  GitHub blocks external resource loads in SVG images, so do not replace the
  data URI with a remote `href`.
- App READMEs reference the PNGs through stable `raw.githubusercontent.com`
  URLs on `main` so npm resolves them too; the root README uses the in-repo
  relative path. The SVG stays available as editable source and as the asset
  packed with `@nones/opencode-mcp`.
- The octopus is used unmodified apart from downscaling for the banner card.
  Do not recolour, redraw or crop the mark for variants.

The octopus identifies Nones Tools projects and links back to the
[monorepo](https://github.com/nones-tools/nones-mcp).
