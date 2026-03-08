import { useEffect } from 'react'
import { X, MapPin, Clock, ExternalLink, AlertTriangle } from 'lucide-react'
import { formatDate, getSeverityColor, getSeverityBg, getCategoryLabel, getCategoryIcon } from '../utils/helpers'
import ActionChecklist from './ActionChecklist'

export default function ThreatDetail({ threat, clientId, onClose, onToast }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!threat) return null

  const sev = threat.severity || 'low'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-haven-surface border-l border-haven-border shadow-2xl flex flex-col animate-slide-in overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-haven-border">
          <div className="w-10 h-10 rounded-xl bg-haven-card flex items-center justify-center text-xl flex-shrink-0">
            {getCategoryIcon(threat.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getSeverityBg(sev)} ${getSeverityColor(sev)}`}>
                {sev}
              </span>
              {threat.personalized_risk && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  threat.personalized_risk === 'high'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : threat.personalized_risk === 'medium'
                      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                      : 'bg-green-500/15 text-green-400 border border-green-500/30'
                }`}>
                  Risk: {threat.personalized_risk}
                </span>
              )}
              <span className="text-xs text-haven-dim">{getCategoryLabel(threat.type)}</span>
            </div>
            <h2 className="text-base font-semibold text-haven-text leading-snug">{threat.title}</h2>
            {threat.personalized_risk_reason && (
              <p className="text-xs text-haven-dim mt-1">{threat.personalized_risk_reason}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-haven-dim hover:text-haven-text hover:bg-haven-card transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Description */}
          {threat.description && (
            <div>
              <h3 className="text-xs font-semibold text-haven-dim uppercase tracking-wider mb-2">What's happening</h3>
              <p className="text-sm text-haven-sub leading-relaxed">{threat.description}</p>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {threat.location && (
              <div className="bg-haven-card rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 text-haven-dim text-xs mb-1"><MapPin size={11} /> Location</div>
                <span className="text-sm text-haven-text">{threat.location}</span>
              </div>
            )}
            <div className="bg-haven-card rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-haven-dim text-xs mb-1"><Clock size={11} /> Reported</div>
              <span className="text-sm text-haven-text">{formatDate(threat.reported_at || threat.created_at)}</span>
            </div>
            {threat.status && (
              <div className="bg-haven-card rounded-lg px-3 py-2">
                <div className="text-haven-dim text-xs mb-1">Status</div>
                <span className={`text-sm font-medium capitalize ${
                  threat.status === 'active' ? 'text-severity-high' :
                  threat.status === 'resolved' ? 'text-severity-low' : 'text-haven-sub'
                }`}>{threat.status}</span>
              </div>
            )}
          </div>

          {/* Warning banner for critical */}
          {sev === 'critical' && (
            <div className="flex items-start gap-3 bg-severity-critical/10 border border-severity-critical/30 rounded-xl p-3">
              <AlertTriangle size={16} className="text-severity-critical flex-shrink-0 mt-0.5" />
              <p className="text-xs text-severity-critical leading-relaxed">
                This is a critical threat. Take protective actions immediately and consider notifying local authorities.
              </p>
            </div>
          )}

          {/* Action Checklist */}
          <ActionChecklist threat={threat} clientId={clientId} onToast={onToast} />

          {/* Source link */}
          {threat.source_url && (
            <a
              href={threat.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-haven-bright hover:text-haven-primary transition-colors"
            >
              <ExternalLink size={13} />
              View original source
            </a>
          )}
        </div>
      </div>
    </>
  )
}
