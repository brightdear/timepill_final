import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

const C = {
  dark: '#101319',
  orange: '#FF9F0A',
  orangeLight: '#FFF2D8',
  bg: '#FAFAF8',
  white: '#FFFFFF',
} as const

// ─── A: Pill Dot ─────────────────────────────────────────────────────────────
// 'i' 위에 오렌지 캡슐이 점으로 올라간 워드마크
function LogoA() {
  return (
    <View style={a.root}>
      <Text style={a.text}>T</Text>
      <View style={a.iWrap}>
        <View style={a.dot} />
        <Text style={a.text}>i</Text>
      </View>
      <Text style={a.text}>mep</Text>
      <View style={a.iWrap}>
        <View style={a.dot} />
        <Text style={a.text}>i</Text>
      </View>
      <Text style={a.text}>ll</Text>
    </View>
  )
}
const a = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end' },
  text: { fontSize: 36, fontWeight: '800', color: C.dark, letterSpacing: -0.5 },
  iWrap: { alignItems: 'center' },
  dot: { width: 7, height: 5, borderRadius: 3, backgroundColor: C.orange, marginBottom: 1 },
})

// ─── B: Clock + Pill ─────────────────────────────────────────────────────────
// 알약+시계를 합친 아이콘 + 워드마크
function LogoB() {
  return (
    <View style={b.root}>
      <View style={b.icon}>
        <View style={b.clockRing}>
          <View style={b.handH} />
          <View style={b.handM} />
        </View>
        <View style={b.pillBadge} />
      </View>
      <Text style={b.text}>Timepill</Text>
    </View>
  )
}
const b = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clockRing: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 3, borderColor: C.dark,
    alignItems: 'center', justifyContent: 'center',
  },
  handH: { position: 'absolute', width: 2, height: 8, backgroundColor: C.dark, bottom: '50%', left: '50%', marginLeft: -1, borderRadius: 1 },
  handM: { position: 'absolute', width: 2, height: 11, backgroundColor: C.orange, bottom: '50%', left: '50%', marginLeft: 2, borderRadius: 1, transform: [{ rotate: '45deg' }] },
  pillBadge: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 7, borderRadius: 4, backgroundColor: C.orange },
  text: { fontSize: 28, fontWeight: '700', color: C.dark, letterSpacing: -0.3 },
})

// ─── C: Stacked Split ────────────────────────────────────────────────────────
// TIME(얇게) / 오렌지 라인 / PILL(굵게) 2줄 스택
function LogoC() {
  return (
    <View style={c.root}>
      <Text style={c.top}>TIME</Text>
      <View style={c.line} />
      <Text style={c.bottom}>PILL</Text>
    </View>
  )
}
const c = StyleSheet.create({
  root: { flexDirection: 'column', gap: 1 },
  top: { fontSize: 13, fontWeight: '300', color: C.dark, letterSpacing: 5 },
  line: { height: 2, backgroundColor: C.orange, width: '100%' },
  bottom: { fontSize: 30, fontWeight: '900', color: C.dark, letterSpacing: 1 },
})

// ─── D: Capsule Frame ────────────────────────────────────────────────────────
// 워드마크를 캡슐 테두리 안에 배치, 왼쪽 절반은 오렌지 배경
function LogoD() {
  return (
    <View style={d.capsule}>
      <View style={d.leftHalf} />
      <Text style={d.text}>Timepill</Text>
    </View>
  )
}
const d = StyleSheet.create({
  capsule: {
    height: 44, borderRadius: 22,
    borderWidth: 2.5, borderColor: C.dark,
    paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  leftHalf: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: '42%',
    backgroundColor: C.orange,
  },
  text: { fontSize: 22, fontWeight: '800', color: C.dark, letterSpacing: -0.2, zIndex: 1 },
})

// ─── E: Dot Grid ─────────────────────────────────────────────────────────────
// 글자 사이에 오렌지 알약 도트가 박힌 느낌
function LogoE() {
  return (
    <View style={e.root}>
      <Text style={e.text}>TIME</Text>
      <View style={e.dots}>
        {[0, 1, 2].map(i => <View key={i} style={e.dot} />)}
      </View>
      <Text style={[e.text, { color: C.orange }]}>PILL</Text>
    </View>
  )
}
const e = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 26, fontWeight: '800', color: C.dark, letterSpacing: 2 },
  dots: { flexDirection: 'column', gap: 3, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.orange },
})

// ─── F: Serif Mix ────────────────────────────────────────────────────────────
// "Time" 크고 가볍게, "pill" 작고 오렌지로 — 무게와 색상 대비
function LogoF() {
  return (
    <View style={f.root}>
      <Text style={f.big}>Time</Text>
      <Text style={f.small}>pill</Text>
    </View>
  )
}
const f = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  big: { fontSize: 38, fontWeight: '200', color: C.dark, letterSpacing: -1 },
  small: { fontSize: 26, fontWeight: '800', color: C.orange, letterSpacing: -0.5, marginBottom: 2 },
})

// ─── G: Two-Tone ─────────────────────────────────────────────────────────────
// "Time" 다크 + "pill" 오렌지 — 두 가지 색상 워드마크
function LogoG() {
  return (
    <Text style={g.base}>
      <Text style={g.dark}>Time</Text>
      <Text style={g.orange}>pill</Text>
    </Text>
  )
}
const g = StyleSheet.create({
  base: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5 },
  dark: { color: C.dark },
  orange: { color: C.orange },
})

// ─── H: Icon + Word ──────────────────────────────────────────────────────────
// 오렌지 알약 아이콘(반반) + 클린 워드마크
function LogoH() {
  return (
    <View style={h.root}>
      <View style={h.pillIcon}>
        <View style={h.leftCap} />
        <View style={h.rightCap} />
      </View>
      <Text style={h.text}>Timepill</Text>
    </View>
  )
}
const h = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pillIcon: { flexDirection: 'row', width: 32, height: 18, borderRadius: 9, overflow: 'hidden', borderWidth: 1.5, borderColor: C.dark },
  leftCap: { flex: 1, backgroundColor: C.orange },
  rightCap: { flex: 1, backgroundColor: C.white },
  text: { fontSize: 28, fontWeight: '700', color: C.dark, letterSpacing: -0.3 },
})

// ─── Export ───────────────────────────────────────────────────────────────────
export type LogoVariant = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

const VARIANTS: Record<LogoVariant, React.FC> = {
  A: LogoA,
  B: LogoB,
  C: LogoC,
  D: LogoD,
  E: LogoE,
  F: LogoF,
  G: LogoG,
  H: LogoH,
}

export function TimepillLogo({ variant = 'G' }: { variant?: LogoVariant }) {
  const Logo = VARIANTS[variant]
  return <Logo />
}
