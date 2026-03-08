export default function Spinner({ size = 'md', className = '' }) {
  const s = { sm: 16, md: 24, lg: 36 }[size] || 24
  return (
    <svg
      width={s} height={s}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin-slow ${className}`}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
