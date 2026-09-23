// A download click does not prove that Safari saved the file.
const BACKUP_KEY = "lad.notes.backup-verified-at";

export function backupSignature(data: unknown): string {
  const serialized = JSON.stringify(data);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16)}`;
}

export function readBackupMade(signature: string) {
  try {
    return localStorage.getItem(BACKUP_KEY) === signature;
  } catch {
    return false;
  }
}

export function markBackupMade(signature: string) {
  try {
    localStorage.setItem(BACKUP_KEY, signature);
  } catch {
    // Отметка — удобство, а не условие работы.
  }
}
