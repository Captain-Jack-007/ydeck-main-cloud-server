# Server-Safe Slide Fonts

YDeck frontend templates and generated slide HTML must use local fonts that the
server renderer can actually see. Do not use remote font imports, Google Fonts,
CDN font CSS, or browser-only font dependencies in frontend-exposed templates.

## Installed Palette

Use these stacks in `template.json.typography`, preview HTML, and generated
slide HTML:

```css
--font-sans: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
--font-display: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
--font-editorial: "New York", "Bodoni 72", Georgia, serif;
--font-serif: Charter, Georgia, "Times New Roman", serif;
--font-mono: Menlo, "SF NS Mono", "Courier New", monospace;
--font-condensed: "Avenir Next Condensed", "DIN Condensed", "Arial Narrow", sans-serif;
--font-cjk-sans: "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", sans-serif;
--font-cjk-serif: "Hiragino Mincho ProN", "Songti SC", serif;
```

## Role Mapping

- Headings: `--font-display`
- Body: `--font-sans`
- Labels and compact metadata: `--font-condensed`
- Numbers and metric callouts: `--font-display`
- Code and technical labels: `--font-mono`
- Quotes and editorial emphasis: `--font-editorial`
- Chinese/Japanese/Korean text: `--font-cjk-sans` or `--font-cjk-serif`

## Template Rule

Every frontend-exposed `template.json` should include:

```json
{
  "typography": {
    "source": "server-safe-local-fonts",
    "fontStacks": {
      "sans": "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
      "display": "\"Avenir Next\", \"Helvetica Neue\", Arial, sans-serif",
      "editorial": "\"New York\", \"Bodoni 72\", Georgia, serif",
      "serif": "Charter, Georgia, \"Times New Roman\", serif",
      "mono": "Menlo, \"SF NS Mono\", \"Courier New\", monospace",
      "condensed": "\"Avenir Next Condensed\", \"DIN Condensed\", \"Arial Narrow\", sans-serif",
      "cjkSans": "\"Hiragino Sans\", \"Hiragino Sans GB\", \"Heiti SC\", sans-serif",
      "cjkSerif": "\"Hiragino Mincho ProN\", \"Songti SC\", serif"
    }
  }
}
```

Unavailable remote-font names such as `Inter`, `JetBrains Mono`,
`Playfair Display`, `Space Grotesk`, `IBM Plex Mono`, and `Archivo` should not
be used as primary template fonts unless bundled locally later.
