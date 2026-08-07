# Design QA

- Reference: `/Users/qianhuisun/Desktop/Plotline Hifi Redesign (standalone).html`
- Browser: Codex in-app Browser only
- Viewports: desktop `1302 × 814` and narrow mobile `302 × 654` (the in-app browser's available clamped sizes)
- States checked: Create default, Platform popover, Sources popover, Duration popover, Aspect ratio popover, inline source error, Smart Intake missing fields, outline generation, retained storyboard `needs_update`, and Complete

## Source-versus-build comparison

- Captured the standalone Create reference and implementation sequentially in the same tab and viewport, then reviewed both images together.
- Matched the reference's measured `680px` composer width, Source Serif heading, DM Sans controls, warm neutral surface, green accent, `12px` card radius, `40px` input row, and approximately `145px` desktop composer height.
- Corrected the implementation's overly tall two-row prompt field; the final card measures `146.5px` versus the reference's `144.7px` at the comparison viewport.
- The standalone artifact exposes a fixed desktop artboard and renders no narrow-layout source at the available mobile viewport. The implementation's narrow layout was therefore checked directly for preserved typography/tokens, readable hierarchy, popover collision handling, sticky actions, and zero horizontal overflow.
- Final desktop and narrow-build review found no P0, P1, or P2 visual mismatch in the implemented product contract.

## Functional checks

- Platform, Sources, Duration, and Aspect ratio controls open their intended popovers, expose the selected value, and close after selection.
- Escape closes a popover and returns focus to its trigger; outside-click behavior is covered by the active browser test.
- Invalid source URLs remain in context and display the inline `Enter a valid URL.` alert.
- Desktop and narrow mobile popovers remain inside the viewport. At `302px` viewport width their measured widths are `261.5px`, `262.3px`, `271.5px`, and `263.9px`, with zero document overflow.
- Create persisted the chosen prompt, `90 seconds`, `YouTube`, and `9:16` into the SQLite-backed intake and navigated to Smart Intake.
- Smart Intake displays known Create values as editable fields and asks only for the missing viewer outcome, audience, audience level, tone, and production formats.
- The running outline job appears as a non-destructive status overlay while the saved intake remains available.
- A retained stale storyboard stays visible with explicit `Regenerate storyboard` and `Keep as-is` actions.
- Complete renders the approved three-panel storyboard with duration, word count, Share, and Download PDF controls.
- Desktop and narrow mobile Create/Smart Intake states have zero horizontal document overflow.

## Accessibility checks

- The Create prompt, source URL, Smart Intake inputs, radio groups, tablist, popover dialogs, workflow status, and validation alert all expose accessible names and roles in the browser accessibility snapshot.
- Keyboard semantics were exercised for tab/radio controls; Escape dismissal and focus return were verified.
- Visible focus uses the approved green accent and remains inside all tested viewports.
- Key contrast ratios meet WCAG AA for normal text: green on white `6.22:1`, body on warm background `13.78:1`, muted text on warm background `5.14:1`, and error text on white `6.76:1`.

- Final result: passed
