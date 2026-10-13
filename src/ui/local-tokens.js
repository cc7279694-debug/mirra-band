// Vela design units for the isolated local-session profile (168 × 240).
function freezeTree(value) {
  Object.keys(value).forEach(key => { if (value[key] && typeof value[key] === 'object') freezeTree(value[key]); });
  return Object.freeze(value);
}
module.exports = freezeTree({
  colors: { background: '#FFFFFF', surface: '#F2F4F7', surfaceRaised: '#F2F4F7', divider: '#F2F4F7',
    textPrimary: '#181A1D', textSecondary: '#626873', textTertiary: '#626873', accent: '#386FBE',
    accentPressed: '#386FBE', onAccent: '#FFFFFF', accentStrongReference: '#386FBE', warning: '#386FBE', danger: '#181A1D' },
  page: { width: 168, nominalHeight: 240, contentWidth: 144 },
  safe: { horizontal: 12, top: 12, bottom: 12 },
  spacing: [4, 6, 8, 12, 16, 24],
  radius: { card: 14, primary: 16, secondary: 12, key: 9 },
  hit: { minimumWidth: 32, minimumHeight: 32, primaryHeight: 40, secondaryHeight: 40, inlineWidth: 40, inlineHeight: 40 },
  split: { primaryWidth: 84, gap: 8, secondaryWidth: 52 },
  digit: { width: 44, height: 32, gap: 6, rowGap: 4 },
  typography: { timer: { size: 40, lineHeight: 46 }, longTimer: { size: 28, lineHeight: 36 }, title: { size: 16, lineHeight: 22 },
    action: { size: 13, lineHeight: 18 }, book: { size: 12, lineHeight: 16 }, button: { size: 13, lineHeight: 18 },
    body: { size: 12, lineHeight: 17 }, label: { size: 10, lineHeight: 14 }, diagnostic: { size: 9, lineHeight: 14 } },
  layout: { reading: { headerY: 12, headerHeight: 40, bookY: 56, bookHeight: 28, timerY: 90, timerHeight: 60,
    statusY: 154, statusHeight: 16, actionsY: 180, actionsHeight: 40 },
  ready: { headerY: 12, headerHeight: 40, bookY: 56, bookHeight: 40, actionY: 100, actionHeight: 78, actionsY: 180, actionsHeight: 40 },
  pageEditor: { toolbarHeight: 40, pageHeight: 22 } }
});
