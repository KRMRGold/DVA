# DVA Test Record

**Document version:** 0.6.10\
**Current status:** Local Windows frontend and native filesystem checks passed. Browser checks verified panel movement, resizing, undo, redo, and reopening. Windows desktop acceptance remains pending.\
**Accepted application baseline:** The earlier frontend-only run belongs to the old `zpitchfolo/DVAexe` repository and does not establish acceptance of the current `zpitchfolo/DVA` source.

## Local Windows verification

Run on 2026-11-26 from 15:53 to 16:02 EST in a disposable copy of local `main` at `3d6aee250445f3109bb7daf0f357ab84bc42df8c`. The copy contained the existing `Cargo.lock` 0.2.0 version sync. The recovery candidate added changes to `app/src-tauri/src/lib.rs`. The byte hash of the applied source matched the tested copy. Environment was Windows build 22631, Node.js 24.15.0, npm 11.12.1, Rust 1.95.0, and Tauri CLI 2.12.4.

| Check | Evidence |
|---|---|
| Dependencies | **PASS.** `npm ci --ignore-scripts --no-audit` with a disposable cache installed 118 packages from the lockfile. The initial tests using copied dependencies failed because the copy omitted dependency build outputs and the installed Vitest was older than the lockfile. |
| Frontend | **PASS.** `npm test` passed all 11 tests with Vitest 4.1.12. `npm run build` passed TypeScript and Vite 8.3.5. |
| Dependency audit | **PASS.** `npm audit` reported zero vulnerabilities. |
| Native baseline | **PASS.** `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml` passed five tests. |
| Native recovery candidate | **PASS.** The same Cargo command passed eight tests. Added coverage checks that missing primary JSON preserves backup and temporary files, a normal save replaces the primary and keeps the previous version, and a failed backup leaves the primary readable. |
| Desktop build | **PASS.** `cargo build --offline --locked --manifest-path src-tauri/Cargo.toml` built the application with a disposable Tauri data directory and a loopback dev server for the desktop check. |
| Desktop interaction | **BLOCKED.** The isolated WebView2 initialized a profile, and the renderer logs reported GPU process failures. The loopback WebView debugger connection was refused on the original attempt, the environment-variable retry, and the software-rendering retry. Desktop typing, migration, shortcuts, and graceful close/reopen could not be exercised. |
| Hosted native CI | **Unverified.** The existing run link did not return the job result during this session. The Windows Cargo results above were run locally. |

## Control Layer layout verification

Run on 2026-11-26 against local main at 3d6aee2 with the transparent, viewport-pinned Control Layer in app/src/App.css. The disposable copy used Node.js 24.15.0 and npm 11.12.1.

- **PASS.** npm test passed all 11 frontend tests. npm run build passed TypeScript and Vite.
- **PASS.** A 1280 × 720 in-app browser fixture used the app stylesheet with 14 panels and a long workspace path. The workspace scrolled independently, the controls stayed at the viewport bottom, and the last panel remained above them. The footer and shortcut key backgrounds were transparent.
- The first standalone headless Chrome attempt exited at GPU initialization. The browser fixture supplied the layout evidence. Native desktop persistence still has the separate blocker recorded above.


Overlay follow-up on 2026-11-26. The same 1280 × 720 browser fixture passed with one panel and with 14 panels. Panels passed behind the transparent shortcuts, hit testing reached the panel behind a shortcut, and the last panel scrolled clear. Both the header and the shortcuts stayed pinned. npm test passed all 11 tests and npm run build passed.

## Interactive note preview verification

Run on 2026-11-26 from a disposable copy of local main at 3d6aee2 with the YAML button changes. The user reported that saving works in their app.

- **PASS.** npm test passed 14 tests. Added coverage for a saved YAML button after remount, target IDs that are missing or ambiguous, and an unsupported action that leaves the source editable. The search test also checks that it focuses the matching panel.
- **PASS.** npm run build passed TypeScript and Vite. npm audit reported zero vulnerabilities with yaml 2.9.1 in the lockfile.
- **PASS.** In the browser preview at 127.0.0.1:1431, two notes were created through the normal editor. The Open outline button focused the outline panel before and after reloading the page.
- The new feature was exercised in the browser preview. The Windows desktop runtime check remains separate.


Paste follow-up on 2026-11-26. npm test passed all 16 tests and npm run build passed. Added regression coverage for copied, indented fences in previously saved notes and for separator text inside a YAML block label. In the running Windows DVA app, Ctrl+R restored the two existing sample notes with their correct titles. Expanding Story draft Preview showed Open outline, and clicking it made Story outline active. This check exercised a WebView reload and the native preview interaction.

## Inline YAML editor verification

Run on 2026-11-26 from a disposable copy of local main at 3d6aee2 with the inline editor and the locked CodeMirror dependencies.

- **PASS.** npm test passed all 18 frontend tests. Added coverage for recognizing the closing fence, preserving prose before and after buttons, editing and folding the source, and rendering multiple blocks in order.
- **PASS.** npm run build passed TypeScript and Vite. Vite warned that the main JavaScript chunk is 602.37 kB before compression. npm audit reported zero vulnerabilities.
- **PASS.** In DVA's browser preview on port 1437, real keyboard input completed a closing fence and added prose below it. The arrow exposed the YAML, editing the label updated the button, and the folded button focused its target. Reload restored the edited button and the surrounding text.
- Windows desktop verification of this revision remains pending.


## Inline carousel verification

Run on 2026-11-26 from a disposable copy of local main at 3d6aee2 with the carousel changes.

- **PASS.** npm test passed all 21 frontend tests. New tests cover card order and excerpts, keyboard focus during navigation, opening a linked panel, a missing target, selection through edits and folding, and a helpful error for an empty list.
- **PASS.** npm run build passed TypeScript and Vite. The existing chunk-size warning reported a 605.54 kB main chunk before compression.
- **PASS.** In the browser preview on port 1441, one YAML block contained a button and a carousel. Enter on Next advanced the carousel with focus intact. Opening a card selected its panel. Editing its source updated the selected card's excerpt, and the edited content was available after reloading.
- The browser preview exercises the inline carousel. Windows desktop verification of this revision remains pending.


## Workspace undo and redo verification

Run on 2026-11-26 from a disposable copy of local main at 3d6aee2 with the workspace history changes.

- **PASS.** npm test passed all 25 tests. New coverage checks grouped typing and caret restoration, undo and redo across panel and text changes, clearing redo after a fresh edit, preserving search input behavior, and editing expanded YAML.
- **PASS.** npm run build passed TypeScript and Vite. Vite reported its existing main-chunk size warning.
- **PASS.** In the browser preview on port 1445, Ctrl+Z undid a typing burst and Ctrl+Y restored it. Undo restored a closed panel and its writing. Ctrl+Shift+Z closed it again. After another undo, the restored panel survived reload. The same shortcuts also undid and redid a YAML button label edit while its source stayed expanded.
- The browser preview exercises the workspace history. Windows desktop verification of this revision remains pending.


## Panel layout verification

Run on 2026-11-26 in a disposable copy of local main at 3d6aee2 with the panel layout changes.

- **PASS.** `npm test` passed all 26 tests, including keyboard movement, keyboard resizing, undo and redo, editing a resized panel, and restoring the layout after reopening.
- **PASS.** `npm run build` passed TypeScript and Vite. Vite reported its existing main-chunk size warning.
- **PASS.** `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml` passed all 9 tests. The new test saves and reloads the panel order and dimensions through the native JSON file.
- **PASS.** In the browser preview on port 1449, a corner drag increased the right panel from 421 × 328 to 521 × 397 CSS pixels while its left edge stayed in place. Dragging the title grip moved it to the first position. Undo and Redo changed the size and order in separate steps. The final layout survived a reload.
- Windows desktop UI verification of this revision remains pending.

## Native persistence candidate

| New persistence slice | Current source status |
|---|---|
| Native JSON | Rust commands load and save `workspace.json` under Tauri's app-data directory |
| JSON shape | `schemaVersion: 1`, an ordered `panels[]` with `id/title/content` and optional `size`, and `activePanelId` |
| Migration | When primary JSON and its recovery artifacts are absent, the app validates any legacy localStorage data, writes and verifies JSON, and keeps the legacy copy |
| Recovery | Invalid saved data or a recovery file alongside a missing primary pauses initialization and autosave |
| Write strategy | Flush and verify a temporary file, preserve the previous file as a `.bak`, then replace the primary in one rename |
| Native tests | Local Windows tests cover schema validation and filesystem recovery cases |
| Desktop acceptance | **BLOCKED** at WebView2 startup in the isolated test environment |

## Earlier frontend candidate

| Field | Result |
|---|---|
| Repository | [zpitchfolo/DVA](https://github.com/zpitchfolo/DVA) |
| Tested source commit | `18840cc589d560c2e03edf30e44d82db0833b95c` (includes the Ctrl+F shortcut and Vitest 4.1.12 dependency update) |
| Changes included | Local-storage autosave/restore, explicit Save, Ctrl/Cmd+S, Ctrl/Cmd+N, Ctrl/Cmd+F panel search, regression tests |
| Automated tests | **PASS**: 1 test file, 8 tests passed in GitHub Actions |
| Type check and production build | **PASS**: `npm run build` completed (`tsc --noEmit && vite build`) |
| CI | **PASS**: [GitHub Actions run #5](https://github.com/zpitchfolo/DVA/actions/runs/40443935029), Ubuntu 24.04, Node 22.23.3, npm 10.9.9; `npm ci`, `npm test`, and `npm run build` all succeeded |
| Desktop launch | User reports the current app launches and panel splitting works; this is user-reported evidence, not an independent runtime check of this candidate |
| Save/restart acceptance | User reports content survives close/reopen; not independently verified in this environment |
| Dependency audit warning | `npm ci` reported 2 moderate-severity vulnerabilities; no audit remediation was attempted in this run |
| Overall result | **FRONTEND CI PASS. APP ACCEPTANCE STILL PENDING.** |

## Latest verified source checks

- Frontend run #24: [tests for guarded recovery](https://github.com/zpitchfolo/DVA/actions/runs/40446583175), passed on commit `053aba3042e80161ef72e63a67899e536d670f30`.
- Frontend run #25: [design schema documentation](https://github.com/zpitchfolo/DVA/actions/runs/40446600224), passed on commit `2cf62f5de4d3fcc76a956e3a99ca5fe5fb1a1cee`.
- Native CI run [#26](https://github.com/zpitchfolo/DVA/actions/runs/40446618518) failed because the workflow used a manifest path inconsistent with its `app/` working directory. The workflow command was corrected in commit `f797fbbe9d8ed885ffa2c6bf1cb9f4e709042740`; replacement run [#29](https://github.com/zpitchfolo/DVA/actions/runs/40446714626) has passed the frontend job, while its native job is still installing Linux dependencies at the time of this record. The native Rust test result is not yet known.

## Earlier dependency baseline

- Workflow: [DVA frontend checks, run #18](https://github.com/zpitchfolo/DVA/actions/runs/40445179309)
- Tested commit: `18840cc589d560c2e03edf30e44d82db0833b95c`
- Environment: Ubuntu 24.04.5 LTS; Node.js 22.23.3; npm 10.9.9; Vitest 4.1.12.
- `npm ci`: PASS.
- `npm audit`: PASS; 0 vulnerabilities reported.
- `npm test`: PASS; 1 test file, 8 tests passed.
- `npm run build`: PASS; TypeScript check and Vite production build succeeded.
- This was a hosted frontend CI run, not a local run in the user’s Windows environment. It did not launch the Tauri desktop app or test native filesystem persistence.

## Current test coverage

- Initial editable panel renders.
- Creating a panel preserves the first panel.
- Closing one panel preserves another panel.
- Empty state allows creating a panel again.
- Editing and creating panels persists and restores after remount.
- Ctrl/Cmd+N creates a panel.
- Ctrl/Cmd+F opens search and selecting a result focuses the matching panel.
- Ctrl/Cmd+S writes the current workspace snapshot and reports save status.
- Malformed localStorage is preserved and triggers recovery UI without autosaving over the source.
- Structurally invalid localStorage is preserved and does not become a starter workspace.
- Rust schema round-trip, unsupported schema version, duplicate panel ID, invalid active-panel ID, and empty-workspace validation tests are included in the new native CI job.

## Required next verification

1. Launch the current candidate with `npm run tauri dev` in an interactive Windows session using disposable test data.
2. Verify legacy data migration, panel contents and active state through close/reopen, Ctrl+N, Ctrl+F, Ctrl+S, and the Save button.
3. Verify that malformed JSON, backup-only startup, and save failures surface a clear recovery or failure message in the desktop UI.
4. Confirm the native CI job result and record exact desktop outcomes before accepting the candidate.

## Known gaps and stop conditions

- Native JSON persistence and guarded localStorage migration are now implemented in source, but must not be described as accepted until native CI and desktop runtime verification pass.
- User-chosen workspace paths, import/export, schema migrations beyond version 1, history snapshots, and a dedicated recovery/restore UI for malformed native JSON remain unimplemented.
- Browser/WebView storage can fail or be cleared. The source now pauses autosave when stored data cannot be validated, but native write-failure and backup-restore behavior still require execution evidence.
- A successful frontend test run alone does not prove that persistence survives a real desktop app restart. That must be checked separately.
- Do not mark this candidate accepted until the automated checks pass and the desktop persistence flow is verified.

## Evidence rules

- Update this record after each actual run; Git history retains previous records.
- Record date/time, OS, Node/npm/Rust/Tauri versions, commit SHA, exact commands, exit status, and concise output.
- Separate automated tests, desktop runtime checks, and manual acceptance checks.
- Mark unavailable checks as **NOT RUN** and explain why. Source review or generated tests are not a test result.
- Any failed required test blocks acceptance until repaired and rerun.
