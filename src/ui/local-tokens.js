// Vela design units for the isolated local-session profile (168 × 240).
function freezeTree(value) {
  Object.keys(value).forEach(key => { if (value[key] && typeof value[key] === 'object') freezeTree(value[key]); });
  return Object.freeze(value);
}
module.exports = freezeTree({
  colors: { background: '#0B0F14', surface: '#151C25', surfaceRaised: '#1D2733', divider: '#2A384A',
    textPrimary: '#EEF3F8', textSecondary: '#A6B2C3', textTertiary: '#8D9AAE', accent: '#6598E8',
    accentPressed: '#5688D5', onAccent: '#0B0F14', accentStrongReference: '#386FBE', warning: '#E8B75D', danger: '#FFB4AB' },
  page: { width: 168, nominalHeight: 240, contentWidth: 144 },
  safe: { horizontal: 12, top: 12, bottom: 12 },
  spacing: [4, 6, 8, 12, 16, 24],
  radius: { card: 14, primary: 16, secondary: 12, key: 9 },
  hit: { minimumWidth: 32, minimumHeight: 32, primaryHeight: 40, secondaryHeight: 40, inlineWidth: 40, inlineHeight: 32 },
  split: { primaryWidth: 84, gap: 8, secondaryWidth: 52 },
  digit: { width: 44, height: 32, gap: 6, rowGap: 4 },
  typography: { timer: { size: 40, lineHeight: 46 }, longTimer: { size: 28, lineHeight: 36 }, title: { size: 16, lineHeight: 22 },
    action: { size: 13, lineHeight: 18 }, book: { size: 12, lineHeight: 16 }, button: { size: 13, lineHeight: 18 },
    body: { size: 12, lineHeight: 17 }, label: { size: 10, lineHeight: 14 }, diagnostic: { size: 9, lineHeight: 14 } },
  layout: { reading: { headerY: 12, headerHeight: 32, bookY: 48, bookHeight: 28, timerY: 86, timerHeight: 60,
    statusY: 154, statusHeight: 16, actionsY: 180, actionsHeight: 40 },
  ready: { headerY: 12, headerHeight: 32, bookY: 48, bookHeight: 40, actionY: 94, actionHeight: 76, actionsY: 180, actionsHeight: 40 },
  pageEditor: { toolbarHeight: 32, pageHeight: 28 } }
});
