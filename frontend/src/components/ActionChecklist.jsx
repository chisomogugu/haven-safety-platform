import { useState } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { getThreatActions, completeAction } from '../api'
import Spinner from './ui/Spinner'
import EmptyState from './ui/EmptyState'
import { Shield } from 'lucide-react'

export default function ActionChecklist({ threat, clientId, onToast }) {
  const [actions, setActions]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [completing, setCompleting] = useState(null)
  const [whyThisMatters, setWhyThisMatters] = useState('')
  const [sourceNote, setSourceNote] = useState('')

  const load = async () => {
    if (actions !== null) { setOpen(o => !o); return }
    setOpen(true)
    setLoading(true)
    try {
      const res = await getThreatActions(threat.id, clientId)
      setActions(res.actions || [])
      setWhyThisMatters(res.why_this_matters || '')
      setSourceNote(res.source_note || '')
    } catch {
      onToast?.('Failed to load action steps', 'error')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const toggle = async (idx, step, done) => {
    if (done) return  // already done
    setCompleting(idx)
    try {
      await completeAction(threat.id, clientId, idx, step)
      setActions(prev => prev.map((a, i) => i === idx ? { ...a, completed: true } : a))
      onToast?.('Action marked complete!', 'success')
    } catch {
      onToast?.('Failed to save progress', 'error')
    } finally {
      setCompleting(null)
    }
  }

  const doneCount = (actions || []).filter(a => a.completed).length

  return (
    <div className="border border-haven-border rounded-xl overflow-hidden">
      <button
        onClick={load}
        className="w-full flex items-center justify-between px-4 py-3 bg-haven-surface hover:bg-haven-card transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-haven-primary" />
          <span className="text-sm font-medium text-haven-text">Protective Actions</span>
          {actions !== null && (
            <span className="text-xs text-haven-dim bg-haven-muted/30 px-2 py-0.5 rounded-full">
              {doneCount}/{actions.length}
            </span>
          )}
        </div>
        {loading
          ? <Loader2 size={14} className="text-haven-dim animate-spin" />
          : open
            ? <ChevronUp size={14} className="text-haven-dim" />
            : <ChevronDown size={14} className="text-haven-dim" />
        }
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2 bg-haven-card border-t border-haven-border">
          {sourceNote && (
            <p className="text-[11px] text-haven-dim bg-haven-surface border border-haven-border rounded-lg px-2.5 py-2">
              {sourceNote}
            </p>
          )}
          {whyThisMatters && (
            <p className="text-xs text-haven-sub leading-relaxed bg-haven-surface border border-haven-border rounded-lg px-2.5 py-2">
              {whyThisMatters}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : !actions?.length ? (
            <EmptyState icon={Shield} title="No actions found" description="Try refreshing." />
          ) : (
            actions.map((action, idx) => {
              const done = action.completed
              const busy = completing === idx
              return (
                <button
                  key={idx}
                  onClick={() => toggle(idx, action.step || action, done)}
                  disabled={done || busy}
                  className={`w-full flex items-start gap-3 text-left p-3 rounded-lg transition-all ${
                    done
                      ? 'bg-green-500/5 opacity-60'
                      : 'hover:bg-haven-surface'
                  }`}
                >
                  <span className="flex-shrink-0 mt-0.5">
                    {busy
                      ? <Loader2 size={16} className="text-haven-primary animate-spin" />
                      : done
                        ? <CheckCircle2 size={16} className="text-green-400" />
                        : <Circle size={16} className="text-haven-muted" />
                    }
                  </span>
                  <span className={`text-sm leading-relaxed ${done ? 'line-through text-haven-dim' : 'text-haven-sub'}`}>
                    <span>{action.step || action}</span>
                    {(action.time_estimate || action.tooltip) && (
                      <span className="block mt-1 text-[11px] text-haven-dim">
                        {action.time_estimate ? `${action.time_estimate}` : ''}
                        {action.time_estimate && action.tooltip ? ' · ' : ''}
                        {action.tooltip || ''}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
          {/* Progress bar */}
          {actions?.length > 0 && (
            <div className="pt-2">
              <div className="flex justify-between text-[10px] text-haven-dim mb-1">
                <span>Progress</span>
                <span>{Math.round((doneCount / actions.length) * 100)}%</span>
              </div>
              <div className="h-1 rounded-full bg-haven-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-haven-primary transition-all duration-500"
                  style={{ width: `${(doneCount / actions.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
