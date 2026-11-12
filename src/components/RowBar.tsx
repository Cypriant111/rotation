/**
 * The bar behind a ranked row. It lives inside `.row-body`, so it can never
 * reach under the count column. Width is a transform (scaleX) so it can grow
 * from zero without layout work; see `.row-bar` in index.css.
 */
export function RowBar({ ratio }: { ratio: number }) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0.04, ratio)) : 0.04
  return <div className="row-bar" style={{ '--r': r } as React.CSSProperties} aria-hidden />
}
