import { useEffect, useMemo, useState } from 'react'
import type { DayPoint } from '../lib/stats'
import { fmtDayKey, fmtDayKeyFull, fmtInt, msToMin, weekdayNarrow } from '../lib/format'

interface Props {
  points: DayPoint[]
}

function niceCeil(n: number): number {
  if (n <= 10) return 10
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= n) return m * pow
  }
  return 10 * pow
}

const H = 150
const PLOT_H = 118
const AXIS_Y = PLOT_H + 4
const W = 340

/** Daily listening minutes. Single series, accent hue, tap for values. */
export function BarChart({ points }: Props) {
  const [sel, setSel] = useState<number | null>(null)

  // stale selection points at the wrong day after a period switch
  useEffect(() => setSel(null), [points])

  const { max, maxIdx } = useMemo(() => {
    let max = 0
    let maxIdx = 0
    points.forEach((p, i) => {
      if (p.ms > max) {
        max = p.ms
        maxIdx = i
      }
    })
    return { max: niceCeil(msToMin(max)), maxIdx }
  }, [points])

  const n = points.length
  if (n === 0) return null
  const slot = W / n
  const barW = Math.min(24, Math.max(3, slot - 2)) // >=2px surface gap between bars
  const x = (i: number) => i * slot + (slot - barW) / 2
  const y = (min: number) => PLOT_H - (min / max) * (PLOT_H - 18)

  const selected = sel !== null ? points[sel] : null
  const showWeekdays = n <= 7
  const cap = Math.min(barW / 2, 4)

  // nearest-column tap layer: the whole plot is the hit target
  const onTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.min(n - 1, Math.max(0, Math.floor(fx / slot)))
    setSel(sel === i ? null : i)
  }

  // clamp the peak label so it never leaves the viewBox
  const peakLabelX = Math.min(W - 14, Math.max(14, x(maxIdx) + barW / 2))

  return (
    <div className="chart-wrap">
      <div className="chart-tip" aria-live="polite">
        {selected ? (
          <>
            <strong>{fmtInt(msToMin(selected.ms))} min</strong>
            {' · '}
            {selected.plays} {selected.plays === 1 ? 'play' : 'plays'}
            {' · '}
            {fmtDayKeyFull(selected.dayStart)}
          </>
        ) : (
          ' '
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Minutes listened per day; values in the table below"
        onClick={onTap}
      >
        {/* recessive grid behind the bars */}
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
        ))}
        <line x1={0} x2={W} y1={PLOT_H} y2={PLOT_H} stroke="var(--hairline)" strokeWidth={1} />

        {points.map((p, i) => {
          const min = msToMin(p.ms)
          const by = min > 0 ? y(min) : PLOT_H
          const h = PLOT_H - by
          return (
            <g key={p.dayStart}>
              {h > 0 && (
                <path
                  d={
                    h > cap
                      ? `M${x(i)},${PLOT_H} v${-(h - cap)} q0,${-cap} ${cap},${-cap} h${barW - cap * 2} q${cap},0 ${cap},${cap} v${h - cap} z`
                      : `M${x(i)},${PLOT_H} v${-h} h${barW} v${h} z`
                  }
                  fill="var(--accent)"
                  opacity={sel === null || sel === i ? 1 : 0.4}
                />
              )}
              {showWeekdays && (
                <text
                  x={x(i) + barW / 2}
                  y={AXIS_Y + 10}
                  fontSize={10}
                  fill={sel === i ? 'var(--ink)' : 'var(--ink-3)'}
                  textAnchor="middle"
                >
                  {weekdayNarrow(p.dayStart)}
                </text>
              )}
              {!showWeekdays && (i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
                <text
                  x={x(i) + barW / 2}
                  y={AXIS_Y + 10}
                  fontSize={10}
                  fill="var(--ink-3)"
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                >
                  {fmtDayKey(p.dayStart)}
                </text>
              )}
            </g>
          )
        })}

        {/* tick + peak labels painted last so no bar can cover them */}
        {[0.5, 1].map((f) => (
          <text
            key={f}
            x={W}
            y={y(max * f) - 3}
            fontSize={9.5}
            fill="var(--ink-3)"
            textAnchor="end"
            fontVariant="tabular-nums"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {fmtInt(max * f)}
          </text>
        ))}
        {msToMin(points[maxIdx]?.ms ?? 0) > 0 && sel === null && (
          <text
            x={peakLabelX}
            y={y(msToMin(points[maxIdx].ms)) - 5}
            fontSize={10}
            fontWeight={600}
            fill="var(--ink-2)"
            textAnchor="middle"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {fmtInt(msToMin(points[maxIdx].ms))}
          </text>
        )}
      </svg>
      {/* the WCAG-clean twin: every value reachable without the tooltip */}
      <table className="sr-only">
        <caption>Minutes listened per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Minutes</th>
            <th scope="col">Plays</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.dayStart}>
              <th scope="row">{fmtDayKeyFull(p.dayStart)}</th>
              <td>{fmtInt(msToMin(p.ms))}</td>
              <td>{p.plays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
