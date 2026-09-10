# Task 2 Report — Shared UI Primitives

## Status

Completed. The shared `frontend/src/ui` layer now provides semantic button, field, surface, status, feedback, header, brand, and icon primitives, with a barrel export and pure token contracts.

## Files

- `frontend/src/ui/AppIcon.tsx`
- `frontend/src/ui/BrandMark.tsx`
- `frontend/src/ui/Button.tsx`
- `frontend/src/ui/Feedback.tsx`
- `frontend/src/ui/Field.tsx`
- `frontend/src/ui/ScreenHeader.tsx`
- `frontend/src/ui/StatusBadge.tsx`
- `frontend/src/ui/Surface.tsx`
- `frontend/src/ui/index.ts`
- `frontend/src/ui/tokens.ts`
- `frontend/src/ui/ui.test.ts`

## TDD record

1. Added `ui.test.ts` before `tokens.ts` existed.
2. Ran `npm run test --workspace=frontend -- src/ui/ui.test.ts` and confirmed the intended RED failure: Vite could not resolve `./tokens`.
3. Added the token contracts and primitives.
4. Re-ran the focused test and observed 2 passing tests.

## Verification

All commands were run in the UI redesign worktree after the final source edit.

| Command | Result |
| --- | --- |
| `npm run test --workspace=frontend -- src/ui/ui.test.ts` | PASS — 2 tests in 1 file |
| `npm run test:frontend` | PASS — 10 tests in 5 files |
| `npm run typecheck:frontend` | PASS — `tsc --noEmit` exit 0 |
| `git diff --check` | PASS — no whitespace errors |

## Self-review

- Verified the required public component interfaces and barrel exports are present.
- Verified primary buttons are 52px high; all other button and field interactions are at least 44px high.
- Verified buttons expose the button role, disabled/busy state, loading feedback, press feedback, and focus rings; disabled state is the only opacity change.
- Verified fields use focus/error borders and announce helper/error text; `InlineAlert` uses an alert role with text-only feedback; `EmptyState.description` is required.
- Verified components derive colors and typography from the Task 1 theme contract, and no existing business contracts or `testID`s were changed.

## Commit

`feat(ui): bo sung primitive giao dien van hanh`

## Concerns

No blocking concerns. These are foundational primitives only; feature screens have not yet been migrated to consume them.

## Fix round 1 — accessibility and surface hierarchy

Addressed the three Important review findings only:

- Dark primary and danger buttons now use the dedicated `#B42318` / `#FFFFFF` operational token pair, whose tested contrast ratio is at least 4.5:1.
- Raised `Surface` now uses the background and subtle border hierarchy only; it no longer borrows floating-action elevation.
- `Field editable={false}` now applies semantic sunken background, subtle border, muted text, and muted placeholder colors after consumer input styles so the disabled state stays visible.

### RED

Command: `npm run test --workspace=frontend -- src/ui/ui.test.ts`

Output: 2 existing tests passed; the 2 new contracts failed as expected because `buttonTone`, `surfaceTreatment`, and `fieldState` were undefined (`Cannot read properties of undefined`).

### GREEN and verification

| Command | Result |
| --- | --- |
| `npm run test --workspace=frontend -- src/ui/ui.test.ts` | PASS — 4 tests in 1 file |
| `npm run test:frontend` | PASS — 12 tests in 5 files |
| `npm run typecheck:frontend` | PASS — `tsc --noEmit` exit 0 |
| `git diff --check` | PASS — no whitespace errors |

### Fix-round self-review

- The dark-only background override and white foreground are used by both primary and danger button palettes, including their normal visual state.
- Pressed dark buttons use the existing deeper `#B42318` semantic pressed color, which also exceeds the contrast threshold with white text.
- `Surface` no longer imports or applies elevation; its raised treatment is tokenized as a one-pixel border and zero elevation.
- Disabled field styles take precedence over `inputStyle`, preserving the visible disabled state.

## Fix round 2 — dark pressed-button feedback

Addressed the Important review finding only: dark primary and danger button backgrounds are now `#B42318` normally and `#8F1C13` while pressed. Both states use white text and are covered by the contrast contract. This supersedes the pressed-state note in fix round 1.

### RED

Command: `npm run test --workspace=frontend -- src/ui/ui.test.ts`

Output: 4 existing tests passed and the new pressed-feedback contract failed as expected because the dark `pressed` token was undefined (`Cannot read properties of undefined (reading 'slice')` while calculating contrast).

### GREEN and verification

| Command | Result |
| --- | --- |
| `npm run test --workspace=frontend -- src/ui/ui.test.ts` | PASS — 5 tests in 1 file |
| `npm run test:frontend` | PASS — 13 tests in 5 files |
| `npm run typecheck:frontend` | PASS — `tsc --noEmit` exit 0 |
| `git diff --check` | PASS — no whitespace errors |

### Fix-round self-review

- The `Button` palette consumes the dark pressed token for both primary and danger variants; light-mode behavior is unchanged.
- The regression fails if normal and pressed dark colors become equal, or if either white-text contrast ratio drops below 4.5:1.
