import { useEffect, useMemo, useRef, useState } from 'react'
import { useGrowOnShow } from '../lib/motion'
import type { DayPoint } from '../lib/stats'
import { fmtDayKey, fmtDayKeyFull, fmtInt, msToMin, weekdayNarrow } from '../lib/format'

interface Props {
  title: string
  points: DayPoint[]
  /** columns grow from the axis when this changes (and on first show) */
  animateKey?: unknown
}

function niceCeil(n: number): number {
  if (n <= 10) return 10
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= n) return m * pow
  }
  return 10 * pow
}

const W = 340
/** right-hand column for the scale labels */
const AXIS_W = 28
const PLOT_W = W - AXIS_W
const TOP = 8
const PLOT_H = 120
const BASE = TOP + PLOT_H
const H = BASE + 20
/** labels closer than this would overprint each other */
const LABEL_CLEAR = 13

/** Daily listening minutes. Single series, accent hue, tap for values. */
export function BarChart({ title, points, animateKey }: Props) {
  const [sel, setSel] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  useGrowOnShow(svgRef, '.chart-bar', animateKey, 'scaleY(0)')

  // stale selection points at the wrong day after a period switch
  useEffect(() => setSel(null), [points])

  const { max, avg } = useMemo(() => {
    let peak = 0
    let sum = 0
    for (const p of points) {
      if (p.ms > peak) peak = p.ms
      sum += p.ms
    }
    return { max: niceCeil(msToMin(peak)), avg: points.length > 0 ? sum / points.length / 60_000 : 0 }
  }, [points])

  const n = points.length
  if (n === 0) return null
  const slot = PLOT_W / n
  const barW = Math.min(24, Math.max(3, slot - 2)) // >=2px surface gap between bars
  const x = (i: number) => i * slot + (slot - barW) / 2
  const y = (min: number) => BASE - (min / max) * PLOT_H

  const selected = sel !== null ? points[sel] : null
  const showWeekdays = n <= 7
  const cap = Math.min(barW / 2, 4)
  const avgY = y(avg)
  const showAvg = avg > 0

  // nearest-column tap layer: the whole plot is the hit target
  const onTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.min(n - 1, Math.max(0, Math.floor(fx / slot)))
    setSel(sel === i ? null : i)
  }

  const axisLabel = { fontSize: 11.5, fill: 'var(--ink-2)', fontVariant: 'tabular-nums' } as const

  return (
    <section className="block">
      <div className="section-head">
        <h2>{title}</h2>
        <div className="chart-tip" aria-live="polite">
          {selected && (
            <>
              <strong>{fmtInt(msToMin(selected.ms))} min</strong>
              {' · '}
              {fmtDayKeyFull(selected.dayStart)}
            </>
          )}
        </div>
      </div>
      <div className="card">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Minutes listened per day; values in the table below"
        onClick={onTap}
      >
        {/* scale: top line at the maximum, baseline at zero */}
        <line x1={0} x2={PLOT_W} y1={TOP} y2={TOP} stroke="var(--hairline)" strokeWidth={1} />
        <line x1={0} x2={PLOT_W} y1={BASE} y2={BASE} stroke="var(--hairline)" strokeWidth={1} />

        {points.map((p, i) => {
          const min = msToMin(p.ms)
          const h = min > 0 ? BASE - y(min) : 0
          return (
            <g key={p.dayStart}>
              {h > 0 && (
                <path
                  className="chart-bar"
                  d={
                    h > cap
                      ? `M${x(i)},${BASE} v${-(h - cap)} q0,${-cap} ${cap},${-cap} h${barW - cap * 2} q${cap},0 ${cap},${cap} v${h - cap} z`
                      : `M${x(i)},${BASE} v${-h} h${barW} v${h} z`
                  }
                  fill="var(--accent)"
                  opacity={sel === null || sel === i ? 1 : 0.4}
                />
              )}
              {showWeekdays && (
                <text
                  x={x(i) + barW / 2}
                  y={BASE + 15}
                  fontSize={11.5}
                  fill={sel === i ? 'var(--ink)' : 'var(--ink-2)'}
                  textAnchor="middle"
                >
                  {weekdayNarrow(p.dayStart)}
                </text>
              )}
              {!showWeekdays && (i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
                <text
                  x={i === 0 ? 0 : i === n - 1 ? PLOT_W : x(i) + barW / 2}
                  y={BASE + 15}
                  fontSize={11.5}
                  fill="var(--ink-2)"
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                >
                  {fmtDayKey(p.dayStart)}
                </text>
              )}
            </g>
          )
        })}

        {/* average across the period, drawn over the bars */}
        {showAvg && (
          <line
            x1={0}
            x2={PLOT_W}
            y1={avgY}
            y2={avgY}
            stroke="var(--ink-3)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        {/* scale labels in their own column, so no bar can run under them */}
        {(!showAvg || avgY - TOP >= LABEL_CLEAR) && (
          <text x={PLOT_W + 6} y={TOP + 4} {...axisLabel}>
            {fmtInt(max)}
          </text>
        )}
        {showAvg && (
          <text x={PLOT_W + 6} y={avgY + 4} {...axisLabel}>
            avg
          </text>
        )}
        {(!showAvg || BASE - avgY >= LABEL_CLEAR) && (
          <text x={PLOT_W + 6} y={BASE + 4} {...axisLabel}>
            0
          </text>
        )}
      </svg>
      {/* the WCAG-clean twin: every value reachable without the tooltip.
          sr-only sits on the wrapper: tables ignore width:1px/overflow, and
          the 24-column heatmap table alone made the page 1200px wide */}
      <div className="sr-only">
        <table>
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
      </div>
    </section>
  )
}
