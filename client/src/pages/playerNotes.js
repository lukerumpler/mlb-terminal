export const PLAYER_NOTE_CATEGORIES = ['Scouting', 'Development', 'Medical', 'Performance', 'Workflow'];

export function playerNotesStorageKey(playerId) {
  return `skip-player-notes:${playerId}`;
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map(tag => String(tag).trim().replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 8);
}

export function normalizeImportedNotes(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.observations;
  if (!Array.isArray(rows)) return [];
  return rows.filter(note => note && typeof note.text === 'string' && note.text.trim()).map((note, index) => ({
    id: String(note.id || `imported-${Date.now()}-${index}`),
    text: note.text.trim(),
    category: PLAYER_NOTE_CATEGORIES.includes(note.category) ? note.category : 'Scouting',
    tags: normalizeTags(note.tags),
    createdAt: Number.isFinite(Number(note.createdAt)) ? Number(note.createdAt) : Date.now(),
    ...(note.updatedAt ? { updatedAt: Number(note.updatedAt) } : {}),
  }));
}

export function readPlayerNotes(playerId) {
  if (!playerId || typeof localStorage === 'undefined') return [];
  try {
    return normalizeImportedNotes(JSON.parse(localStorage.getItem(playerNotesStorageKey(playerId)) || '[]'));
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

export function renameNoteTag(notes, fromTag, toTag) {
  const from = String(fromTag || '').trim().replace(/^#/, '').toLowerCase();
  const to = String(toTag || '').trim().replace(/^#/, '').toLowerCase();
  if (!from || !to || from === to) return Array.isArray(notes) ? notes : [];
  return notes.map(note => ({ ...note, tags: normalizeTags((note.tags || []).map(tag => tag === from ? to : tag)) }));
}

export function buildNotesExportPayload(playerId, playerName, observations, exportedAt = new Date().toISOString()) {
  return { schema: 'skip-player-notes/v1', playerId, playerName: playerName || 'Player', exportedAt, observations: normalizeImportedNotes(observations) };
}

export function applyImportedNotes(current, incoming, mode = 'merge') {
  const imported = normalizeImportedNotes(incoming);
  if (mode === 'replace') return imported;
  return [...imported, ...(Array.isArray(current) ? current : []).filter(note => !imported.some(row => row.id === note.id))];
}

export function removeNoteTag(notes, tagToRemove) {
  const target = String(tagToRemove || '').trim().replace(/^#/, '').toLowerCase();
  if (!target) return Array.isArray(notes) ? notes : [];
  return notes.map(note => ({ ...note, tags: normalizeTags((note.tags || []).filter(tag => tag !== target)) }));
}
