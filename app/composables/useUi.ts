export type ThemeMode = 'system' | 'dark' | 'light'

export const DEFAULT_ACCENT = '#5865f2'
export const ACCENT_PRESETS = [DEFAULT_ACCENT, '#86b300', '#3498db', '#1abc9c', '#9b59b6', '#e91e63', '#e74c3c', '#e67e22', '#f1c40f']

export const DEFAULT_SUMMARY_MODEL = 'openrouter/free'

export interface Profile {
  name: string
  /** Image URL or data URL; empty falls back to a generated avatar */
  avatar: string
}

interface UiState {
  navOpen: boolean
  panelOpen: boolean
  settingsOpen: boolean
  apiKey: string
  /** The user's own name and picture */
  me: Profile
  /** Shown on every answer when set; otherwise each answer shows its model */
  ai: Profile
  /** Compresses long threads; falls back to the thread's own model if it fails */
  summaryModel: string
  theme: ThemeMode
  accent: string
}

/** Drawers plus everything the settings modal stores in localStorage. */
export function useUi() {
  return useState<UiState>('ui', () => reactive({
    navOpen: false,
    panelOpen: false,
    settingsOpen: false,
    apiKey: loadJson('aiscord:api-key', ''),
    me: loadJson<Profile>('aiscord:me', { name: '나', avatar: '' }),
    ai: loadJson<Profile>('aiscord:ai', { name: '', avatar: '' }),
    summaryModel: loadJson('aiscord:summary-model', DEFAULT_SUMMARY_MODEL),
    theme: loadJson<ThemeMode>('aiscord:theme', 'system'),
    accent: loadJson('aiscord:accent', DEFAULT_ACCENT),
  })).value
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && !matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  saveJson('aiscord:theme', mode)
}

/** Set the theme color; CSS derives hover/soft/link shades from --accent-base. */
export function applyAccent(color: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT
  const root = document.documentElement.style
  root.setProperty('--accent-base', hex)
  root.setProperty('--accent-fg', isLight(hex) ? '#060607' : '#ffffff')
  saveJson('aiscord:accent', hex)
}

/** Whether dark text reads better than white on this color (WCAG relative luminance). */
function isLight(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4
}
