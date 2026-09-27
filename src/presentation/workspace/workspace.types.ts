export type WorkspaceSection = 'today' | 'discover' | 'requests' | 'circles' | 'progress' | 'trust' | 'moderation'

/** `short` is the mobile tab label; the full label is used in the sidebar and for screen readers. */
export const workspaceNavigation: ReadonlyArray<{ id: WorkspaceSection; label: string; short: string; icon: string }> = [
  { id: 'today', label: 'Bugun', short: 'Bugun', icon: '⌁' },
  { id: 'discover', label: 'Kashfiyot', short: 'Kashf', icon: '◇' },
  { id: 'requests', label: 'So‘rovlar', short: 'So‘rov', icon: '↗' },
  { id: 'circles', label: 'Doiralar', short: 'Doira', icon: '◌' },
  { id: 'progress', label: 'Progress', short: 'Natija', icon: '↟' },
  { id: 'trust', label: 'Trust markazi', short: 'Trust', icon: '◎' },
]

/** Shown only to staff; the server enforces the role on every moderation call. */
export const moderationNavigation = { id: 'moderation' as const, label: 'Moderatsiya', short: 'Moder.', icon: '⚑' }
