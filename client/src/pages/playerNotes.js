export const PLAYER_NOTE_CATEGORIES = ['Scouting', 'Development', 'Medical', 'Performance', 'Workflow'];

export function playerNotesStorageKey(playerId) {
  return `skip-player-notes:${playerId}`;
}

export function readPlayerNotes(playerId) {
  if (!playerId || typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(playerNotesStorageKey(playerId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(note => note && note.id && note.text) : [];
  } catch {
    return [];
  }
}

export function sortPlayerNotes(notes, mode = 'date-desc') {
  return [...(Array.isArray(notes) ? notes : [])].sort((a, b) => {
    if (mode === 'category') return String(a.category || '').localeCompare(String(b.category || '')) || Number(b.createdAt || 0) - Number(a.createdAt || 0);
    const direction = mode === 'date-asc' ? 1 : -1;
    return direction * (Number(a.createdAt || 0) - Number(b.createdAt || 0));
  });
}
