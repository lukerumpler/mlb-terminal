function sumNumeric(rows, key) {
  return rows.reduce((total, row) => {
    const value = Number(row?.stat?.[key]);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function buildHandednessComparison(payload, mode = 'season') {
  const sourceRows = mode === 'career' ? payload?.careerRows : payload?.rows;
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  return ['LHP', 'RHP'].map(side => {
    const sideRows = rows.filter(row => row?.side === side);
    if (!sideRows.length) return { side, stat: null };
    const atBats = sumNumeric(sideRows, 'atBats');
    const hits = sumNumeric(sideRows, 'hits');
    const walks = sumNumeric(sideRows, 'baseOnBalls');
    const hbp = sumNumeric(sideRows, 'hitByPitch');
    const sacFlies = sumNumeric(sideRows, 'sacFlies');
    const plateAppearances = sumNumeric(sideRows, 'plateAppearances') || atBats + walks + hbp + sacFlies;
    const totalBases = hits + sumNumeric(sideRows, 'doubles') + (2 * sumNumeric(sideRows, 'triples')) + (3 * sumNumeric(sideRows, 'homeRuns'));
    const avg = atBats ? hits / atBats : null;
    const obp = plateAppearances ? (hits + walks + hbp) / plateAppearances : null;
    const slg = atBats ? totalBases / atBats : null;
    const strikeouts = sumNumeric(sideRows, 'strikeOuts');
    return {
      side,
      stat: {
        avg, obp, slg, ops: avg == null || obp == null || slg == null ? null : obp + slg,
        homeRuns: sumNumeric(sideRows, 'homeRuns'),
        strikeoutRate: plateAppearances ? (strikeouts / plateAppearances) * 100 : null,
        hits, atBats, plateAppearances,
      },
    };
  });
}
