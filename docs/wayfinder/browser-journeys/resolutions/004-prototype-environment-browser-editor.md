# Prototype the Environment browser-journey editor

## Resolution

Use the validated **Hybrid workbench** structure for the production browser-
journey editor:

1. Put a compact Environment card first. It makes the single runner-managed
   Chromium browser explicit and configures its workflow service and container
   port.
2. Follow it with a horizontal journey sequence so authors can scan ordering,
   action/assertion kinds, and validation markers without opening every step.
3. Use a persistent ordered outline beside a focused inspector for detailed
   editing, reordering, and deletion. Selecting either a sequence item or an
   outline item opens the same step state in the inspector.
4. Keep actions and assertions in one sequential, fail-fast list sharing the
   browser session and page. The first slice authors navigate, fill, click,
   URL-match, and visible-element operations.
5. Prefer accessible role, label, visible-text, and test-id locators. Role
   locators require both role and accessible name.
6. Let fill steps choose a durable non-sensitive literal or a durable
   `secretRef`; never put a secret value in the scenario definition.
7. Show validation both at journey level and next to the selected invalid
   field. Keep the complete in-memory prototype state inspectable while
   prototyping; the production editor should instead use the normalized v3
   scenario model.

The hybrid was chosen after comparing three structurally different variants:
Guided stack, Inspector workbench, and Sequence board. It retains the explicit
Environment-first hierarchy of the Guided stack, the long-journey editing
clarity of the Inspector workbench, and the sequence overview of the Sequence
board.

## Prototype source

- Branch: `codex/prototype-browser-journey-editor`
- Initial variants: `db17226`
- Validated hybrid: `ba14800`
- Run from `ui-v2` with `bun run prototype:browser-journey-editor`, then open
  `/workflow/prototype?prototype=browser-journey-editor&variant=D`.

The prototype is a primary-source design artifact, not production code. The
implementation ticket should recreate the validated structure against the real
v3 store and validation boundaries and omit the fake route, switcher, and
prototype state inspector.

## Verification

- The user reviewed the live variants and accepted the Hybrid workbench.
- The hybrid was visually checked at a normal laptop viewport, including the
  full-workbench scroll behavior.
- Selecting a sequence step updates the shared inspector state.
- The prototype passes focused Biome checks, TypeScript checking, and the full
  Next.js production build.
