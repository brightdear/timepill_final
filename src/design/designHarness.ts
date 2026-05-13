export const designHarness = {
  // DESIGN: app-wide neutral colors.
  // Never add unnecessary UI copy. Only show text that provides direct functional value.
  // Change these values first when you want to restyle backgrounds, text, borders, and overlays.
  colors: {
    pageBackground: '#FAFAF8',
    surface: '#ffffff',
    surfaceMuted: '#F4F1EA',
    surfaceSoft: '#F1F1F3',
    textStrong: '#101319',
    textBody: '#2A2F37',
    textMuted: '#8A8F98',
    textSoft: '#A0A5AD',
    borderSoft: '#E8EAEE',
    borderMuted: '#D7DADF',
    overlaySoft: 'rgba(0,0,0,0.4)',
    overlayMedium: 'rgba(0,0,0,0.5)',
    overlayStrong: 'rgba(0,0,0,0.65)',
    overlayHeavy: 'rgba(0,0,0,0.88)',
    overlayPanel: 'rgba(0,0,0,0.92)',
    white: '#ffffff',
    black: '#000000',
    success: '#22C55E',
    warning: '#FF9F0A',
    warningBright: '#FFB340',
    danger: '#A94720',
    info: '#607D8B',
  },

  // DESIGN: typography scale.
  // Change these numbers to enlarge or reduce specific text groups without touching feature logic.
  typography: {
    homeTitleSize: 46,
    registerTitleSize: 48,
    modalTitleSize: 28,
    bodySize: 17,
    secondaryBodySize: 15,
    labelSize: 14,
    captionSize: 13,
    microCopySize: 11,
    actionSize: 16,
    actionLargeSize: 18,
    scanButtonLabelSize: 16,
  },

  // DESIGN: corner radius system.
  // Change these values to make the app sharper or softer.
  radius: {
    card: 16,
    input: 14,
    chip: 999,
    button: 18,
    modal: 30,
    thumbnail: 10,
    roundButton: 22,
    floatingButton: 24,
    scanButton: 45,
    tiny: 4,
  },

  // DESIGN: spacing system.
  // Change these values to tighten or relax layout density.
  spacing: {
    screenX: 24,
    contentX: 24,
    listBottom: 40,
    sectionGap: 28,
    controlGap: 12,
    chipGap: 8,
    overlayPadding: 24,
    footerBottom: 40,
    floatingBottom: 60,
    titleTop: 56,
  },

  // DESIGN: shared shadows and elevation.
  // Change these values when you want flatter or more elevated cards and buttons.
  shadow: {
    color: '#000000',
    cardOpacity: 0.03,
    cardRadius: 8,
    cardOffsetY: 2,
    floatingOpacity: 0.2,
    floatingRadius: 8,
    glowColor: '#ffffff',
    glowOpacity: 0.3,
    glowRadius: 12,
  },

  // DESIGN: scan-screen-specific layout knobs.
  // Change these values to adjust scan composition without changing inference logic.
  scan: {
    stageTopRatio: 0.38,
    sideRailTopRatio: 0.25,
    sideRailBottomRatio: 0.2,
    bottomBarOffset: 60,
    guideBorderColor: 'rgba(255,255,255,0.7)',
    guideBorderStrongColor: 'rgba(255,255,255,0.8)',
    devPreviewHeight: 220,
    devPanelMaxHeightRatio: 0.75,
    scanButtonSize: 90,
  },
} as const

export type DesignHarness = typeof designHarness
