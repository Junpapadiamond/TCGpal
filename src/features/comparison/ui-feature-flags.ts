// The paste-a-listing domain path remains supported, but its buyer entry points
// stay hidden until the interaction and evidence review flow are polished.
export const PASTE_LISTING_UI_ENABLED = false;

// The AI-written Action note. Off until the review corpus reads clean: with this
// false the client never asks for a note and every buyer sees the deterministic
// sentence from verdict-copy.ts. The server has its own AI_VERDICT_NOTE flag, so
// both sides must be turned on deliberately.
export const AI_VERDICT_NOTE_UI_ENABLED = false;
