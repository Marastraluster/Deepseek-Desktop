# Desktop Appearance Plugin Design

## Goal

Add an opt-in desktop-only appearance plugin that lets a user choose a local
background image and adjust surface opacity from General settings. The default
DeepSeek Desktop appearance remains unchanged.

## Scope

- Register one Cordis preference row in `settings.general.item`.
- Let the user choose or remove a local image, and adjust a 55-100% opacity
  slider.
- Persist the image in the Desktop user-data directory and persist only the
  relative asset name and opacity preference.
- Render one background image across the complete window.
- Render the sidebar as a translucent, blurred acrylic surface over that image.
- Apply distinct light and dark surface colors while keeping the image visible
  behind both the sidebar and conversation workspace.
- Preserve the existing visual output exactly when no image is configured and
  opacity remains at 100%.

## Non-Goals

- No cloud upload, remote image URLs, image library, preset wallpaper pack, or
  changes to DeepSeek Harness source packages.
- No release, GitHub push, or modification of the existing installed app during
  local validation.

## Architecture

The new `@deepseek-desktop/appearance` Cordis client plugin will be bundled by
the Desktop renderer alongside official Harness plugins. It owns the General
settings row and mounts a document-level appearance controller. The controller
sets CSS custom properties on the renderer root; scoped style overrides then
paint the full application background, the sidebar acrylic layer, and the
conversation surface without changing any Harness component source.

An Electron main-process IPC boundary will own file selection and storage.
`appearance:select-background` opens a local image dialog, validates an image
extension and size limit, copies it into `<userData>/appearance/`, and returns a
safe relative asset key. `appearance:resolve-background` maps that key to a
file URL for the renderer. `appearance:remove-background` deletes only the
plugin-owned asset. The renderer stores `backgroundAsset` and `surfaceOpacity`
in its existing settings namespace; no absolute local path is persisted.

## Visual Behavior

The background image is fixed, centered, and `cover`-sized on the app root.
The sidebar uses `backdrop-filter: blur(24px) saturate(140%)` with a light
white or dark graphite translucent fill. The primary conversation workspace
uses a related but slightly more opaque surface so messages and controls remain
legible. In light theme the acrylic fill starts from white; in dark theme it
starts from graphite. The opacity slider changes both fills together, from 55%
to 100% in 5% increments. At 100% the surfaces are opaque and a configured
image is intentionally hidden; this gives users a deterministic reset to the
current visual baseline.

## Error Handling

The picker accepts JPEG, PNG, WebP, and GIF images up to 12 MiB. Failed file
selection is a no-op. Failed copy or missing stored files leave the current
background unchanged and show a localized inline error in the settings row.
On startup, an unavailable saved asset is discarded from the local setting and
the normal default background is rendered.

## Testing

- Unit-test asset validation and safe relative-key handling in the main process.
- Unit-test preference normalization, including missing assets and opacity
  bounds.
- Test that the plugin registers its row through `settings.general.item` and
  emits only namespaced CSS properties.
- Test light and dark CSS variable contracts, including sidebar acrylic and
  whole-window background selectors.
- Build the Windows portable package, select a local test image, adjust
  opacity, toggle themes, restart the app, and confirm the preference survives.

## Acceptance Criteria

1. A background image can be selected and removed in General settings.
2. The selected image is visible behind both the sidebar and conversation area.
3. The sidebar has a blurred acrylic appearance in light and dark themes.
4. Opacity takes effect immediately and persists through restart.
5. Without a configured image, the unchanged existing interface is rendered.
6. Validation uses only a locally built Windows portable package; no GitHub
   publishing occurs.
