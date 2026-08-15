# Tray Background Mode

## Goal

Keep DeepSeek Desktop and its Harness Host running after the user closes the main window. The app must terminate only when the user chooses **Quit DeepSeek Desktop** from the system tray's right-click menu.

## Scope

- Support Windows, macOS, and Linux through Electron's cross-platform `Tray` API.
- Use the existing generated application icon as the tray icon.
- Preserve the single main window and its current renderer/IPC ownership model.
- Do not add renderer-side IPC or change conversation state.

## Behaviour

1. Once Electron is ready, create a tray icon with a tooltip of `DeepSeek Desktop`.
2. Closing the main window prevents Electron's default close operation and hides the window instead. The runtime remains active.
3. Clicking the tray icon restores, shows, and focuses the main window. This also applies when a second application launch is received.
4. The tray right-click menu includes `Show DeepSeek Desktop` and `Quit DeepSeek Desktop`.
5. Choosing `Quit DeepSeek Desktop` marks the application as quitting, stops the runtime once, then exits. The window close handler must not hide the window during this shutdown path.
6. Electron's `window-all-closed` event must keep the process alive except during the explicit quit path.

## Structure

- Extract window restoration into a small helper shared by the tray click and `second-instance` handlers.
- Keep the tray instance in module scope so it remains alive for the application lifetime.
- Use a module-level explicit-quit flag to distinguish a user closing a window from an intentional application shutdown.
- Release the tray reference after shutdown has started.

## Error Handling

- If no main window is available, tray actions are no-ops rather than creating a second renderer.
- Runtime stop remains owned by the existing `before-quit` handler and is invoked at most once.

## Verification

- Unit-test the lifecycle decision logic: normal close hides, tray show restores, explicit quit allows shutdown, and `window-all-closed` does not quit implicitly.
- Run the full test suite and a Windows packaged build.
- Manually confirm the packaged app hides on close, restores from the tray, and fully exits only from the tray menu.
