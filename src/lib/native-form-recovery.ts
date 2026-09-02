import type { TcgGame } from "@/lib/schemas";

export type NativeFormSubmit = {
  query: string;
  game: TcgGame | null;
  postalCode: string | null;
};

/**
 * Recovers a search from a URL the browser wrote by submitting the landing form
 * on its own.
 *
 * The card box sits in a real `<form>` with a submit button and no `action`, so
 * an Enter pressed in the window before React hydrates does what plain HTML
 * says: a GET navigation to the same page with every named field in the query
 * string. The buyer sees the page blink and their query disappear — which is
 * exactly the "pressed Enter, nothing happened" report — and their delivery ZIP
 * is left sitting in the address bar and in history.
 *
 * Reading the query back and re-running the search turns that reload into the
 * search they asked for. The caller strips these parameters immediately, so the
 * fields do not persist in the URL.
 */
export function parseNativeFormSubmit(params: URLSearchParams): NativeFormSubmit | null {
  const query = (params.get("heroQuery") ?? "").trim();
  if (!query) return null;

  const game = params.get("game");
  const postalCode = (params.get("postalCode") ?? "").trim();
  return {
    query,
    game: game === "pokemon" || game === "onePiece" ? game : null,
    // Anything that is not a US ZIP is not something to put back into the form:
    // the URL is attacker-supplied as far as this code knows.
    postalCode: /^\d{5}$/.test(postalCode) ? postalCode : null,
  };
}

/** The field names this form puts in the URL when the browser submits it. */
export const NATIVE_FORM_FIELDS = ["heroQuery", "game", "postalCode", "desiredCondition", "taxRatePercent", "url", "marketplace", "cardName", "setCode", "cardNumber"];
