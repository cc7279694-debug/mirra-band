function displayTimer(body, ageMs, continuous) {
  if (!body) return { elapsedMs: null, remainingMs: null, interpolated: false };
  const advance = continuous && ageMs >= 0 ? ageMs : 0;
  const elapsed = body.timerKind === 'SESSION_ELAPSED' || body.timerKind === 'PREPARATION_ELAPSED';
  const remaining = body.timerKind === 'BREAK_REMAINING' || body.timerKind === 'ALLOWANCE_REMAINING';
  return {
    elapsedMs: body.elapsedMs === null ? null : Math.min(9007199254740991, body.elapsedMs + (elapsed ? advance : 0)),
    remainingMs: body.remainingMs === null ? null : Math.max(0, body.remainingMs - (remaining ? advance : 0)),
    interpolated: advance > 0 && (elapsed || remaining),
  };
}
module.exports = { displayTimer };
