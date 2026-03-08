const TYPES = [
  { value: '',               label: 'All' },
  { value: 'digital_scam',   label: 'Scam' },
  { value: 'cyber_threat',   label: 'Cyber' },
  { value: 'physical_hazard',label: 'Physical' },
  { value: 'crime_alert',    label: 'Crime' },
  { value: 'weather',        label: 'Weather' },
]

const SEVERITIES = [
  { value: '',         label: 'Any severity' },
  { value: 'critical', label: 'Critical', color: 'text-severity-critical' },
  { value: 'high',     label: 'High',     color: 'text-severity-high' },
  { value: 'medium',   label: 'Medium',   color: 'text-severity-medium' },
  { value: 'low',      label: 'Low',      color: 'text-severity-low' },
]

export default function FilterPills({ type, severity, onType, onSeverity }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => onType(t.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              type === t.value
                ? 'bg-haven-primary border-haven-primary text-white'
                : 'border-haven-border text-haven-sub hover:border-haven-muted hover:text-haven-text bg-haven-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-haven-border mx-1 hidden sm:block" />

      <div className="flex gap-1.5 flex-wrap">
        {SEVERITIES.map(s => (
          <button
            key={s.value}
            onClick={() => onSeverity(s.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              severity === s.value
                ? 'bg-haven-muted border-haven-muted text-haven-text'
                : `border-haven-border hover:border-haven-muted bg-haven-surface ${s.color || 'text-haven-sub hover:text-haven-text'}`
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
