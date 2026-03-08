import { useState } from 'react'
import { X, AlertTriangle, Loader2, MapPin } from 'lucide-react'
import { createThreat } from '../api'

const TYPES = ['digital_scam', 'cyber_threat', 'physical_hazard', 'crime_alert', 'weather']
const SEVERITIES = ['low', 'medium', 'high', 'critical']

export default function ReportThreatModal({ onClose, onSuccess, defaultLocation }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'digital_scam',
    severity: 'medium', location: defaultLocation || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setError('')
    setLoading(true)
    try {
      const res = await createThreat(form)
      onSuccess?.(res)
    } catch (err) {
      setError(err.message || 'Failed to submit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-haven-card border border-haven-border rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-haven-border">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-severity-high" />
            <h2 className="font-semibold text-haven-text">Report a Threat</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-haven-dim hover:text-haven-text hover:bg-haven-surface transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-1.5">Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Brief description of the threat"
              className="w-full px-3 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text placeholder-haven-dim text-sm outline-none focus:border-haven-primary transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-1.5">Details</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What happened? Include any relevant details..."
              rows={3}
              className="w-full px-3 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text placeholder-haven-dim text-sm outline-none focus:border-haven-primary transition-colors resize-none"
            />
          </div>

          {/* Type + Severity row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className="w-full px-3 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text text-sm outline-none focus:border-haven-primary transition-colors capitalize"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-1.5">Severity</label>
              <select
                value={form.severity}
                onChange={e => set('severity', e.target.value)}
                className="w-full px-3 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text text-sm outline-none focus:border-haven-primary transition-colors capitalize"
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-1.5">Location</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-haven-dim" />
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Area where this occurred"
                className="w-full pl-8 pr-3 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text placeholder-haven-dim text-sm outline-none focus:border-haven-primary transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-sm text-severity-critical">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-haven-sub hover:text-haven-text transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
