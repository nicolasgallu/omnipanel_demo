// Omnipanel logo (from the Figma export).

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#3B5BFF" />
      <rect x="8" y="18" width="4" height="7" rx="1" fill="white" opacity="0.5" />
      <rect x="14" y="12" width="4" height="13" rx="1" fill="white" />
      <rect x="20" y="15" width="4" height="10" rx="1" fill="white" opacity="0.8" />
    </svg>
  )
}
