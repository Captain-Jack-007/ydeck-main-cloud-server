# Product

## Register

product

## Users

YDeck serves people who need finished presentation decks quickly: teachers, students, founders, operators, analysts, and teams generating PowerPoint-style decks from prompts, uploaded files, book chapters, business context, or source material. The user is usually trying to create a useful deck, inspect it while it is being generated, choose a template/design system, and export or revisit the finished artifact.

## Product Purpose

YDeck turns user intent and source material into structured, high-quality HTML-first slide decks. Success means the generated deck feels intentionally designed for its scenario, follows a selected template contract, streams progress clearly to the frontend, passes safety/QA checks, and can be exported or reopened without losing context.

## Brand Personality

Capable, precise, and design-literate. YDeck should feel like a serious presentation studio with enough intelligence to choose structure, not like a generic slide generator that recolors the same layouts.

## Anti-references

Avoid generic AI deck chrome, decorative chart wallpaper, same-layout templates with different colors, remote/unsafe preview assets, and templates that promise more design quality than the generator can reproduce. Avoid making users choose by vague style names when the real choice is deck scenario, flow, and capability.

## Design Principles

- Scenario first: templates are chosen by the user’s job and deck type, not only by visual style.
- Preview honesty: template previews must resemble what the generated deck can actually produce.
- HTML-first craft: every slide is a fixed 1920x1080 static HTML composition with export-safe assets.
- Durable workflow: frontend state should hydrate from persisted job/project records, not only realtime socket events.
- Repair locally: generation and repair should operate slide-by-slide so failures are visible, controlled, and recoverable.

## Accessibility & Inclusion

Frontend and slide previews should target WCAG AA contrast, readable body sizes, reduced-motion-safe behavior, keyboard-accessible controls, and no reliance on color alone for important state. Generated slide HTML should avoid remote fonts and unsafe remote resources.
