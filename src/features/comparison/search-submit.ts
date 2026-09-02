/**
 * Whether an Enter keypress in the card search box should run the search.
 *
 * The hero input sits in a real `<form>` with a real submit button, so a browser
 * that performs implicit form submission already does this. Relying on that
 * alone turned out to be too thin a thread: a visitor reported typing a full
 * query on the live site, pressing Enter twice, and getting no request at all —
 * only the button worked. Implicit submission is the single most common way a
 * search box is used, so the app now runs it explicitly rather than inheriting
 * it. When both paths fire the handler wins, because it prevents the default.
 *
 * The rules deliberately mirror the browser's own so nothing else changes:
 * Enter, no in-flight IME composition, and nothing upstream has claimed the key.
 */
export function submitsOnEnter(event: {
  key: string;
  isComposing: boolean;
  defaultPrevented: boolean;
}): boolean {
  if (event.key !== "Enter") return false;
  // Every Chinese, Japanese, and Korean input method ends candidate selection
  // with Enter. Submitting there searches for a half-composed query and eats the
  // keystroke that was meant to pick the characters.
  if (event.isComposing) return false;
  return !event.defaultPrevented;
}
