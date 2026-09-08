export type WorkspaceSection = 'today' | 'discover' | 'requests' | 'circles' | 'progress' | 'trust'

export const workspaceNavigation: ReadonlyArray<{ id: WorkspaceSection; label: string; icon: string }> = [
  { id: 'today', label: 'Bugun', icon: '⌁' },
  { id: 'discover', label: 'Kashfiyot', icon: '◇' },
  { id: 'requests', label: 'So‘rovlar', icon: '↗' },
  { id: 'circles', label: 'Circles', icon: '◌' },
  { id: 'progress', label: 'Progress', icon: '↟' },
  { id: 'trust', label: 'Trust markazi', icon: '◎' },
]