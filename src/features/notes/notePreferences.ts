const AI_ENABLED_KEY = "lad.notes.ai-enabled";

export function readAiEnabled() {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeAiEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AI_ENABLED_KEY, String(enabled));
  } catch {
    // Local classification remains available when preferences cannot persist.
  }
}
