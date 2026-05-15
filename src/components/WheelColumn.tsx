import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { designHarness } from '@/design/designHarness'

const WH = 52   // item height — matches timepillv2 for identical feel
const HV = 2    // half-visible count: 2 above + center + 2 below = 5 rows

interface WheelColumnProps {
  items: string[]
  selectedIndex: number
  onIndexChange: (i: number) => void
  width?: number
  enableDirectInput?: boolean
  numericInput?: boolean
  onInteractionChange?: (active: boolean) => void
}

export function WheelColumn({
  items,
  selectedIndex,
  onIndexChange,
  width = 80,
  enableDirectInput = false,
  numericInput = false,
  onInteractionChange,
}: WheelColumnProps) {
  // Layout math: item i is at visual center when translateY = (HV - i) * WH
  const minY = -(items.length - HV - 1) * WH  // last item at center
  const maxY = HV * WH                          // first item at center

  const tyAnim = useRef(new Animated.Value((HV - selectedIndex) * WH)).current
  const posRef  = useRef((HV - selectedIndex) * WH)  // live position (updated by listener)
  const baseRef = useRef(posRef.current)               // position at gesture start
  const springRef = useRef<Animated.CompositeAnimation | null>(null)
  const lastTapRef = useRef(0)
  const lastCommittedRef = useRef(selectedIndex)       // last index we reported upward

  // Mutable refs so pan handler always sees latest values without recreating PanResponder
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onChangeRef = useRef(onIndexChange)
  onChangeRef.current = onIndexChange
  const enableDirectInputRef = useRef(enableDirectInput)
  enableDirectInputRef.current = enableDirectInput
  const interactionRef = useRef(onInteractionChange)
  interactionRef.current = onInteractionChange

  const [inputMode, setInputMode] = useState(false)
  const [inputText, setInputText] = useState('')

  // Track posRef during native-driver spring (JS can't read Animated value during native animation)
  useEffect(() => {
    const id = tyAnim.addListener(({ value }) => { posRef.current = value })
    return () => tyAnim.removeListener(id)
  }, [tyAnim])

  // Handle external selectedIndex changes (e.g., edit-mode data loaded async)
  useEffect(() => {
    if (selectedIndex === lastCommittedRef.current) return  // our own snap, ignore
    lastCommittedRef.current = selectedIndex
    const toValue = (HV - selectedIndex) * WH
    springRef.current?.stop()
    posRef.current = toValue
    Animated.spring(tyAnim, { toValue, useNativeDriver: true, tension: 68, friction: 11 }).start()
  }, [selectedIndex, tyAnim])

  const doSnap = (rawY: number, vy: number) => {
    springRef.current?.stop()
    // Add velocity momentum then clamp within valid range
    const momentum = rawY + vy * 120
    const clamped  = Math.max(minY, Math.min(maxY, momentum))
    const idx = Math.max(
      0,
      Math.min(itemsRef.current.length - 1, Math.round((HV * WH - clamped) / WH)),
    )
    const toValue = (HV - idx) * WH
    posRef.current = toValue
    springRef.current = Animated.spring(tyAnim, {
      toValue,
      useNativeDriver: true,
      tension: 68,
      friction: 11,
    })
    springRef.current.start()
    lastCommittedRef.current = idx
    onChangeRef.current(idx)
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        interactionRef.current?.(true)
        springRef.current?.stop()
        baseRef.current = posRef.current
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(minY, Math.min(maxY, baseRef.current + g.dy))
        posRef.current = next
        tyAnim.setValue(next)
      },
      onPanResponderRelease: (_, g) => {
        const isTap = Math.abs(g.dy) < 5 && Math.abs(g.dx) < 5
        doSnap(baseRef.current + g.dy, isTap ? 0 : g.vy)
        interactionRef.current?.(false)
        if (isTap && enableDirectInputRef.current) {
          const now = Date.now()
          if (now - lastTapRef.current < 350) {
            lastTapRef.current = 0
            setInputText('')
            setInputMode(true)
          } else {
            lastTapRef.current = now
          }
        }
      },
      onPanResponderTerminate: (_, g) => {
        interactionRef.current?.(false)
        doSnap(baseRef.current + g.dy, 0)
      },
    }),
  ).current

  const submitInput = (text: string) => {
    setInputMode(false)
    interactionRef.current?.(false)
    if (!numericInput) return
    const n = parseInt(text.trim(), 10)
    if (!Number.isFinite(n)) return
    const padded = String(n).padStart(2, '0')
    let idx = itemsRef.current.indexOf(padded)
    if (idx < 0) idx = itemsRef.current.indexOf(String(n))
    if (idx >= 0) {
      const toValue = (HV - idx) * WH
      posRef.current = toValue
      springRef.current = Animated.spring(tyAnim, {
        toValue,
        useNativeDriver: true,
        tension: 68,
        friction: 11,
      })
      springRef.current.start()
      lastCommittedRef.current = idx
      onChangeRef.current(idx)
    }
  }

  return (
    <View style={{ width, height: WH * (HV * 2 + 1), overflow: 'hidden' }} {...pan.panHandlers}>
      <Animated.View style={{ transform: [{ translateY: tyAnim }] }}>
        {items.map((item, i) => {
          // Per-item opacity and scale interpolated from the list's translateY value.
          // When tyAnim = (HV - i)*WH, item i is at center → opacity 1, scale 1.05.
          const centerTy = (HV - i) * WH
          const ir = [centerTy - 2*WH, centerTy - WH, centerTy, centerTy + WH, centerTy + 2*WH]
          const opacity = tyAnim.interpolate({ inputRange: ir, outputRange: [0.1, 0.3, 1, 0.3, 0.1], extrapolate: 'clamp' })
          const scale   = tyAnim.interpolate({ inputRange: ir, outputRange: [0.6, 0.76, 1.05, 0.76, 0.6], extrapolate: 'clamp' })
          return (
            <Animated.View
              key={i}
              style={{ alignItems: 'center', height: WH, justifyContent: 'center', opacity, transform: [{ scale }] }}
            >
              <Text style={st.text}>{item}</Text>
            </Animated.View>
          )
        })}
      </Animated.View>

      {inputMode && (
        <View style={[st.inputOverlay, { top: WH * HV, height: WH }]}>
          <TextInput
            autoFocus
            keyboardType="number-pad"
            maxLength={2}
            onBlur={() => submitInput(inputText)}
            onChangeText={setInputText}
            onSubmitEditing={e => submitInput(e.nativeEvent.text)}
            style={st.inputField}
            value={inputText}
          />
        </View>
      )}

      {/* Hairline borders framing the center selected row */}
      <View pointerEvents="none" style={[st.line, { top: WH * HV }]} />
      <View pointerEvents="none" style={[st.line, { top: WH * (HV + 1) }]} />
    </View>
  )
}

const st = StyleSheet.create({
  text: { color: designHarness.colors.textStrong, fontSize: 22, fontWeight: '700' },
  line: {
    borderColor: 'rgba(0,0,0,0.15)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 0,
    left: 4,
    position: 'absolute',
    right: 4,
  },
  inputOverlay: {
    alignItems: 'center',
    backgroundColor: '#fff',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  inputField: { color: designHarness.colors.textStrong, fontSize: 22, fontWeight: '700', textAlign: 'center', width: '100%' },
})
