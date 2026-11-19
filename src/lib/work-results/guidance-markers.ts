/**
 * How the app's current guidance is set apart in a message to a harness
 * (`withWorkResultSessionInstructions`): it opens with the first line, and the
 * person's own words follow the second. Kept free of imports so a test's fake
 * harness can read a message the way a real one does.
 */
export const APP_GUIDANCE_OPEN = '[Current Ri session capabilities, supplied by the app.]';
export const USER_MESSAGE_FOLLOWS = '[User message follows.]';
