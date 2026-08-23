const AI_ENABLED_KEY = "lad.notes.ai-enabled";
const AI_CONSENT_KEY = "lad.notes.ai-consent";
const AI_CONSENT_VERSION = "2026-08-cloud-ai-v1";

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

export function readAiConsent() {
  try {
    return localStorage.getItem(AI_CONSENT_KEY) === AI_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function writeAiConsent(consented: boolean) {
  try {
    if (consented) localStorage.setItem(AI_CONSENT_KEY, AI_CONSENT_VERSION);
    else localStorage.removeItem(AI_CONSENT_KEY);
  } catch {
    // Cloud processing stays unavailable when consent cannot be persisted.
  }
}
