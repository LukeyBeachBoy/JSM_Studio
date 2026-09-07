// Anchors the Trackpads page's own side rail scrolls to. Their own module rather
// than an export from KeymapControls, which App only loads lazily -- importing
// them from there would pull the whole panel into the initial bundle.
export const TRACKPAD_ANCHORS = {
  left: 'trackpad-left',
  right: 'trackpad-right',
  buttons: 'trackpad-buttons',
} as const
