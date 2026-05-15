export type IntegrationAuditArea =
  | 'data'
  | 'record'
  | 'wallet'
  | 'inventory'
  | 'routing'
  | 'layout'
  | 'audio'

export type IntegrationAuditCheck = {
  id: number
  area: IntegrationAuditArea
  title: string
  status: 'manual' | 'code'
}

export const integrationAuditChecklist: IntegrationAuditCheck[] = [
  { id: 1, area: 'data', title: 'Scan completion writes a completion record.', status: 'code' },
  { id: 2, area: 'data', title: 'Manual completion writes the same completion record shape.', status: 'code' },
  { id: 3, area: 'data', title: 'Duplicate completion does not duplicate jelly.', status: 'code' },
  { id: 4, area: 'data', title: 'Home derives medication status from completion records.', status: 'manual' },
  { id: 5, area: 'data', title: 'Record derives medication status from completion records.', status: 'manual' },
  { id: 6, area: 'record', title: 'buildQuickDraft(undefined) does not crash.', status: 'code' },
  { id: 7, area: 'record', title: 'openQuickPanel works with no existing status record.', status: 'code' },
  { id: 8, area: 'wallet', title: 'Jelly changes go through the central transaction function.', status: 'code' },
  { id: 9, area: 'wallet', title: 'Insufficient jelly blocks purchase, crane play, and reroll.', status: 'manual' },
  { id: 10, area: 'inventory', title: 'Shop purchase adds inventory.', status: 'code' },
  { id: 11, area: 'inventory', title: 'Crane win adds inventory.', status: 'code' },
  { id: 12, area: 'routing', title: 'Shop to Crane works.', status: 'manual' },
  { id: 13, area: 'routing', title: 'Shop to Inventory works.', status: 'manual' },
  { id: 14, area: 'routing', title: 'Crane result to Inventory works.', status: 'manual' },
  { id: 15, area: 'routing', title: 'Scan success returns only after completion save.', status: 'code' },
  { id: 16, area: 'layout', title: 'Floating banner stays above the tab bar.', status: 'manual' },
  { id: 17, area: 'layout', title: 'Floating shop buttons stay above the tab bar.', status: 'manual' },
  { id: 18, area: 'layout', title: 'Android bottom navigation does not hide tabs.', status: 'manual' },
  { id: 19, area: 'audio', title: 'Crane sound effects initialize without crashing.', status: 'code' },
  { id: 20, area: 'audio', title: 'Missing sound assets do not crash crane play.', status: 'manual' },
]

export function getIntegrationAuditChecklist() {
  return integrationAuditChecklist
}
