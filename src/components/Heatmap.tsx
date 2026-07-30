import { useMemo, useState } from 'react'
import { fmtInt, msToMin } from '../lib/format'

interface Props {
  /** 7 (Mon..Sun) x 24 matrix of ms */
  matrix: number[][]
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const RAMP = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)', 'var(--heat-6)']

const CELL = 12.5
const GAP = 2
const LEFT = 16
const TOP = 2

/** When you listen: weekday x hour, sequential single-hue ramp. */
export function Heatmap({ matrix }: Props) {
  const [sel, setSel] = useState<[number, number] | null>(null)

  const max = useMemo(() => Math.max(1, ...matrix.flat()), [matrix])

  const W = LEFT + 24 * (CELL + GAP)
  const H = TOP + 7 * (CELL + GAP) + 14

  const bucket = (v: number) => {
    if (v <= 0) return -1
    return Math.min(5, Math.floor((v / max) * 6))
  }

  const selected = sel ? matrix[sel[0]][sel[1]] : null

  return (
    <div className="chart-wrap">
      <div className="chart-tip" aria-live="polite">
        {sel && selected !== null ? (
          <>
            <strong>{fmtInt(msToMin(selected))} min</strong>
            {' · '}
            {DAY_NAMES[sel[0]]} {sel[1]}:00–{sel[1] + 1}:00
          </>
        ) : (
          ' '
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Listening by weekday and hour of day"
      >
        {matrix.map((row, d) =>
          row.map((v, h) => {
            const b = bucket(v)
            const cx = LEFT + h * (CELL + GAP)
            const cy = TOP + d * (CELL + GAP)
            const isSel = sel?.[0] === d && sel?.[1] === h
            return (
              <rect
                key={`${d}-${h}`}
                x={cx}
                y={cy}
                width={CELL}
                height={CELL}
                rx={3}
                fill={b === -1 ? 'var(--seg-bg)' : RAMP[b]}
                stroke={isSel ? 'var(--ink)' : 'none'}
                strokeWidth={isSel ? 1.5 : 0}
                onPointerDown={() => setSel(isSel ? null : [d, h])}
              />
            )
          }),
        )}
        {DAYS.map((d, i) => (
          <text
            key={i}
            x={LEFT - 6}
            y={TOP + i * (CELL + GAP) + CELL - 3}
            fontSize={9}
            fill="var(--ink-3)"
            textAnchor="middle"
          >
            {d}
          </text>
        ))}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={LEFT + h * (CELL + GAP)}
            y={H - 3}
            fontSize={9}
            fill="var(--ink-3)"
          >
            {h}:00
          </text>
        ))}
      </svg>
      <div className="heat-legend">
        less
        {RAMP.map((c) => (
          <span key={c} className="swatch" style={{ background: c }} />
        ))}
        more
      </div>
    </div>
  )
}
