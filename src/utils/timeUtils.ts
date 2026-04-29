export function fmtTime(h: number, m: number, labels?: { am: string; pm: string }): string {
  const ampm = h < 12 ? labels?.am ?? '오전' : labels?.pm ?? '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`
}
