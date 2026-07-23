export interface KeyboardShortcutHint {
  display: string;
  keys: string;
}

export const KEYBOARD_SHORTCUTS = {
  compose: { display: "C", keys: "C" },
  toggleSidebar: { display: "[", keys: "[" },
  archive: { display: "E", keys: "E" },
  trash: { display: "#", keys: "#" },
  toggleRead: { display: "U", keys: "U" },
  star: { display: "S", keys: "S" },
  reply: { display: "R", keys: "R" },
  replyAll: { display: "A", keys: "A" },
  forward: { display: "F", keys: "F" },
  find: { display: "⌘F", keys: "Meta+F Control+F" },
  refresh: { display: "⌘R", keys: "Meta+R" },
  bold: { display: "⌘B", keys: "Meta+B" },
  italic: { display: "⌘I", keys: "Meta+I" },
  underline: { display: "⌘U", keys: "Meta+U" },
  bulletedList: { display: "⌘⇧8", keys: "Meta+Shift+8" },
  numberedList: { display: "⌘⇧7", keys: "Meta+Shift+7" },
  undo: { display: "⌘Z", keys: "Meta+Z" },
  redo: { display: "⌘⇧Z", keys: "Meta+Shift+Z" },
} as const satisfies Record<string, KeyboardShortcutHint>;
