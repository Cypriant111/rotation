interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconHome({ size = 25 }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4V15h-5v5.5h-4A1.5 1.5 0 0 1 4 19z" />
    </svg>
  )
}

export function IconCharts({ size = 25 }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M5 20V12" />
      <path d="M12 20V5" />
      <path d="M19 20v-6" />
    </svg>
  )
}

export function IconMixes({ size = 25 }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 6h11M4 11h11M4 16h7" />
      <circle cx="16.5" cy="17" r="2.4" />
      <path d="M18.9 17V8.5l2-1" />
    </svg>
  )
}

export function IconRecap({ size = 25 }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3.8v3.4" strokeWidth="1.4" opacity="0.55" />
    </svg>
  )
}

export function IconSettings({ size = 25 }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    </svg>
  )
}

/** the app mark: a simplified record */
export function Mark({ size = 56 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden>
      <circle cx="28" cy="28" r="26" fill="var(--accent)" />
      <circle cx="28" cy="28" r="16.5" stroke="rgba(0,0,0,0.28)" strokeWidth="1.6" />
      <circle cx="28" cy="28" r="8" fill="var(--card)" />
      <circle cx="28" cy="28" r="2.2" fill="var(--accent)" />
    </svg>
  )
}
