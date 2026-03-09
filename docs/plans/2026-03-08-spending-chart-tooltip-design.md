# SpendingChart Slide Tooltip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add touch-slide interaction to SpendingChart so users can see expense amounts by sliding across the chart.

**Architecture:** Use React Native's built-in PanResponder to track touch position, snap to nearest data point, and render a tooltip overlay inside the existing SVG. Single-file change, no new dependencies.

**Tech Stack:** React Native PanResponder, react-native-svg (Circle, Rect, G already available in v15.15.3)

---

## Task 1: Add PanResponder touch handling and activeIndex state

**Files:**
- Modify: `app/components/dashboard/SpendingChart.tsx:1-10` (imports and state)
- Modify: `app/components/dashboard/SpendingChart.tsx:44-84` (wrap SVG in panResponder View)

**Step 1: Update imports and add state + PanResponder**

Replace the imports and component opening at lines 1-11:

```tsx
import { useState, useRef, useMemo } from 'react'
import { View, Text, PanResponder, useWindowDimensions } from 'react-native'
import Svg, { Path, Line, Circle, Rect, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg'
import type { MonthlySummary } from '@zenbill/shared'
import { Card } from '../ui/Card'

interface Props {
  monthly: MonthlySummary[]
}

export function SpendingChart({ monthly }: Props) {
  const { width: screenWidth } = useWindowDimensions()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
```

**Step 2: Add PanResponder with snap-to-nearest logic**

After `points` array (after line 38), add the PanResponder setup. It needs `points` to calculate nearest index:

```tsx
  const pointsRef = useRef(points)
  pointsRef.current = points

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touchX = evt.nativeEvent.locationX
          const idx = findNearestIndex(pointsRef.current, touchX)
          setActiveIndex(idx)
        },
        onPanResponderMove: (evt) => {
          const touchX = evt.nativeEvent.locationX
          const idx = findNearestIndex(pointsRef.current, touchX)
          setActiveIndex(idx)
        },
        onPanResponderRelease: () => setActiveIndex(null),
        onPanResponderTerminate: () => setActiveIndex(null),
      }),
    []
  )
```

**Step 3: Add the `findNearestIndex` helper function**

Add this before the component (after the `Props` interface, before `export function`):

```tsx
function findNearestIndex(points: { x: number; y: number }[], touchX: number): number {
  let minDist = Infinity
  let nearest = 0
  for (let i = 0; i < points.length; i++) {
    const dist = Math.abs(points[i].x - touchX)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  }
  return nearest
}
```

**Step 4: Wrap the SVG with PanResponder**

Change the `<Svg>` wrapper at line 47 to be inside a View with panHandlers:

```tsx
      <View {...panResponder.panHandlers}>
        <Svg width={svgWidth} height={chartHeight}>
          {/* ... existing SVG content unchanged ... */}
        </Svg>
      </View>
```

**Step 5: Verify the app compiles and renders**

Run: `cd app && npx expo start` (or reload in Expo Go)
Expected: Chart renders exactly as before, no visual change. Touch doesn't crash.

**Step 6: Commit**

```bash
git add app/components/dashboard/SpendingChart.tsx
git commit -m "feat(chart): add PanResponder touch handling to SpendingChart"
```

---

## Task 2: Render tooltip overlay (vertical line + dot + bubble)

**Files:**
- Modify: `app/components/dashboard/SpendingChart.tsx` (add tooltip rendering inside SVG)

**Step 1: Add tooltip rendering after the data points block**

After the `{/* Data points */}` section (line 76-83), add the active tooltip overlay. This goes inside the `<Svg>` element, rendered last so it appears on top:

```tsx
        {/* Active tooltip overlay */}
        {activeIndex !== null && (() => {
          const p = points[activeIndex]
          const amount = `$${values[activeIndex].toLocaleString()}`
          const bubbleW = 80
          const bubbleH = 28
          const bubbleY = p.y - bubbleH - 14
          const triangleSize = 5

          // Clamp bubble X to stay within SVG bounds
          const bubbleCenterX = Math.max(
            paddingLeft + bubbleW / 2,
            Math.min(p.x, svgWidth - paddingRight - bubbleW / 2)
          )
          const bubbleX = bubbleCenterX - bubbleW / 2

          return (
            <G>
              {/* Vertical dashed line */}
              <Line
                x1={p.x}
                y1={paddingTop}
                x2={p.x}
                y2={chartHeight - paddingBottom}
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.3}
              />
              {/* Highlighted dot */}
              <Circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill="#6366f1"
                stroke="#fff"
                strokeWidth={2}
              />
              {/* Bubble background */}
              <Rect
                x={bubbleX}
                y={bubbleY}
                width={bubbleW}
                height={bubbleH}
                rx={6}
                ry={6}
                fill="#1e293b"
              />
              {/* Triangle pointer */}
              <Path
                d={`M${p.x - triangleSize},${bubbleY + bubbleH} L${p.x + triangleSize},${bubbleY + bubbleH} L${p.x},${bubbleY + bubbleH + triangleSize} Z`}
                fill="#1e293b"
              />
              {/* Amount text */}
              <SvgText
                x={bubbleCenterX}
                y={bubbleY + bubbleH / 2 + 4}
                fontSize={12}
                fontWeight="600"
                fill="#ffffff"
                textAnchor="middle"
              >
                {amount}
              </SvgText>
            </G>
          )
        })()}
```

**Step 2: Increase chartHeight to accommodate tooltip above the chart**

The tooltip bubble appears above data points. To prevent clipping at the top, increase `paddingTop` from 10 to 30:

Change line 24:
```tsx
  const paddingTop = 30
```

And increase `chartHeight` from 140 to 160 to compensate:

Change line 23:
```tsx
  const chartHeight = 160
```

**Step 3: Verify the tooltip renders on touch**

Run: Reload app in Expo Go
Expected: Sliding finger across chart shows a dark bubble with amount, vertical dashed line, and highlighted dot. Lifting finger hides everything.

**Step 4: Commit**

```bash
git add app/components/dashboard/SpendingChart.tsx
git commit -m "feat(chart): add tooltip overlay with bubble, dot, and dashed line"
```

---

## Task 3: Clean up original data points rendering

**Files:**
- Modify: `app/components/dashboard/SpendingChart.tsx:76-83` (data points section)

**Step 1: Replace the nested View+Svg data points with simple Circle elements**

The current data points use a nested `<View><Svg><Line></Svg></View>` pattern which is unusual. Replace with simple `<Circle>` elements that are cleaner and consistent with the tooltip's highlighted dot:

Replace the `{/* Data points */}` block:

```tsx
        {/* Data points */}
        {points.map((p, i) => (
          <Circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={activeIndex === i ? 'transparent' : '#6366f1'}
          />
        ))}
```

When `activeIndex === i`, hide the small dot since the larger highlighted dot from the tooltip overlay takes its place.

**Step 2: Verify dots render correctly**

Run: Reload app
Expected: Small dots visible on each data point. When sliding, the touched point shows only the larger highlighted dot (no double-dot).

**Step 3: Commit**

```bash
git add app/components/dashboard/SpendingChart.tsx
git commit -m "refactor(chart): simplify data points to Circle, hide when active"
```

---

## Task 4: Manual QA and edge cases

**Step 1: Test with 1 data point**

The chart handles `values.length === 1` by centering the single point. Verify tooltip works on a single centered point.

**Step 2: Test edge data points (first and last)**

Slide to the leftmost and rightmost data points. Verify the bubble doesn't clip outside the SVG bounds (the `bubbleCenterX` clamping logic handles this).

**Step 3: Test with large amounts**

If amount text is wider than `bubbleW` (80px), it may overflow. For amounts >$999,999, consider if this is realistic for the app. If needed, adjust `bubbleW` dynamically:

```tsx
const bubbleW = Math.max(80, amount.length * 8 + 20)
```

Add this only if overflow is observed during testing.

**Step 4: Test rapid sliding**

Slide finger back and forth rapidly. Verify no flickering or stale state.

**Step 5: Final commit if any adjustments made**

```bash
git add app/components/dashboard/SpendingChart.tsx
git commit -m "fix(chart): tooltip edge case adjustments"
```

---

## Complete File Reference

After all tasks, `app/components/dashboard/SpendingChart.tsx` should have this structure:

```
1.  imports (useState, useRef, useMemo, PanResponder, SVG elements including Circle, Rect, G)
2.  Props interface
3.  findNearestIndex() helper function
4.  SpendingChart component:
    - screenWidth, activeIndex state
    - empty state early return
    - chart dimensions (chartHeight=160, paddingTop=30)
    - labels, values, maxVal, graphHeight, points
    - pointsRef + panResponder (useMemo)
    - return JSX:
      - Card wrapper
      - View with panHandlers
        - Svg
          - Defs (gradient)
          - Grid lines
          - Area fill
          - Line path
          - X-axis labels
          - Data points (Circle, transparent when active)
          - Tooltip overlay (conditional on activeIndex !== null)
```

No other files are modified. No new dependencies.
