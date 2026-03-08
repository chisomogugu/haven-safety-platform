import { MapPin, Clock, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatDate, getSeverityColor, getSeverityBg, getCategoryLabel, getCategoryIcon } from '../utils/helpers'

const SEVERITY_RING = {
  critical: 'border-severity-critical/40',
  high:     'border-severity-high/40',
  medium:   'border-severity-medium/30',
  low:      'border-severity-low/20',
}

const RISK_STYLE = {
  high: 'bg-red-500/15 text-red-400 border border-red-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  low: 'bg-green-500/15 text-green-400 border border-green-500/30',
}

export default function ThreatCard({ threat, onClick }) {
  const sev = threat.severity || 'low'
  const ring = SEVERITY_RING[sev] || 'border-haven-border'

  return (
    <button
      onClick={() => onClick(threat)}
      className={`w-full text-left group bg-haven-card border ${ring} hover:border-haven-primary/40 rounded-xl p-4 transition-all duration-200 hover:shadow-[0_0_20px_rgba(139,92,246,0.08)] hover:-translate-y-0.5 animate-fade-in`}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className="w-9 h-9 rounded-lg bg-haven-surface flex items-center justify-center text-lg flex-shrink-0 mt-0.5">
          {getCategoryIcon(threat.type)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + severity */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-haven-text leading-snug line-clamp-2 group-hover:text-haven-bright transition-colors">
              {threat.title}
            </h3>
            <div className="flex flex-col items-end gap-1">
              <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getSeverityBg(sev)} ${getSeverityColor(sev)}`}>
                {sev}
              </span>
              {threat.personalized_risk && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${RISK_STYLE[threat.personalized_risk] || RISK_STYLE.medium}`}>
                  Risk: {threat.personalized_risk}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {threat.description && (
            <p className="text-haven-sub text-xs leading-relaxed line-clamp-2 mb-2">
              {threat.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] text-haven-dim">
            <span className="flex items-center gap-1">
              <span className="text-haven-muted">{getCategoryLabel(threat.type)}</span>
            </span>
            {threat.location && (
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {threat.location}
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Clock size={10} />
              {formatDate(threat.reported_at || threat.created_at)}
            </span>
          </div>
          {threat.personalized_risk_reason && (
            <p className="text-[11px] text-haven-dim mt-1.5 line-clamp-1">{threat.personalized_risk_reason}</p>
          )}
        </div>

        <ChevronRight size={14} className="text-haven-dim group-hover:text-haven-bright group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
      </div>
    </button>
  )
}
