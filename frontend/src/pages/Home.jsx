import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Shield, AlertTriangle, CheckCircle, CheckCircle2, Circle, HelpCircle, Lightbulb, Target, X, Loader2, ImagePlus, ArrowRight, ChevronRight } from 'lucide-react'
import { getThreats, detectIntent, analyzeScam, getDailyCheckins } from '../api'
import { readFileAsBase64, getVerdictStyle, getScoreColor } from '../utils/helpers'
import FilterPills from '../components/FilterPills'
import ThreatCard from '../components/ThreatCard'
import ThreatDetail from '../components/ThreatDetail'
import ReportThreatModal from '../components/ReportThreatModal'
import ScoreRing from '../components/ScoreRing'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../components/ui/Toast'
import { useNavigate } from 'react-router-dom'

const VERDICT_ICON = {
  scam:        <AlertTriangle size={18} className="text-verdict-scam" />,
  legitimate:  <CheckCircle  size={18} className="text-verdict-legitimate" />,
  unclear:     <HelpCircle   size={18} className="text-verdict-unclear" />,
}

function buildClientSearchFallback(query) {
  return {
    answer: 'AI is temporarily unavailable. Here are practical next steps you can take right now.',
    actions: [
      {
        title: 'Apply baseline protections',
        why: 'These steps reduce immediate risk and improve your safety posture.',
        steps: [
          { step: 'Verify the request or alert through official channels', time: '3 min', points: 3 },
          { step: 'Update passwords for key accounts and enable two-factor authentication', time: '6 min', points: 5 },
          { step: 'Review recent account/device activity for anything unfamiliar', time: '4 min', points: 4 },
        ],
        total_points: 12,
      },
    ],
    ai_unavailable: true,
    source_note: 'Using standard safety guidance (AI temporarily unavailable)',
  }
}

function deriveScoreRating(total) {
  if (total >= 80) return 'good'
  if (total >= 50) return 'fair'
  return 'needs_attention'
}

// ─── Unified Smart Search Bar ─────────────────────────────────────────────────
function SmartSearch({ clientId, onSearchGuidance, onScamResult, onLoading }) {
  const [text, setText]       = useState('')
  const [image, setImage]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDrag]   = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()

  const handleImage = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) return
    const b64 = await readFileAsBase64(file)
    setImage({ b64, preview: URL.createObjectURL(file) })
  }, [])

  const submit = async () => {
    if (!text.trim() && !image) return
    setLoading(true)
    onLoading?.(true)
    try {
      // Detect intent first
      const intentRes = await detectIntent(text, image?.b64, clientId)
      const intent = intentRes.intent
      const routeTo = intentRes.route_to
      const query = (intentRes.query || text).trim()

      if (intent === 'scam_check' || routeTo === 'analyze') {
        // Run scam analysis inline
        const result = await analyzeScam(text, image?.b64, clientId)
        onScamResult?.(result, text, image?.preview)
        setText('')
        setImage(null)
      } else if (intent === 'score' || intent === 'score_check' || routeTo === 'score') {
        onSearchGuidance?.({
          answer: 'Your score now starts at 0 on each reload and is tracked directly on this page. Complete Daily Safety Scoreboard checklist steps below to increase it.',
          actions: [],
          follow_up: '',
        }, query || 'my safety score')
        setText('')
        setImage(null)
      } else if (intent === 'digest' || routeTo === 'digest') {
        navigate('/digest')
      } else if (intent === 'unknown') {
        onSearchGuidance?.({
          answer: "That doesn't look like a safety question. Try asking about threats in your area, checking a suspicious message, or reviewing your safety score.",
          actions: [],
          _unknown: true,
        }, query || text)
        setText('')
        setImage(null)
      } else {
        // intent='search': render AI guidance inline from /api/intent.
        const guidance = intentRes.search_result || buildClientSearchFallback(query)
        onSearchGuidance?.(guidance, query)
        setText('')
        setImage(null)
      }
    } catch {
      // Last-resort client fallback keeps search useful even if /intent fails.
      onSearchGuidance?.(buildClientSearchFallback(text), text)
    } finally {
      setLoading(false)
      onLoading?.(false)
    }
  }

  return (
    <div
      className={`rounded-2xl border transition-all ${
        dragOver ? 'border-haven-primary bg-haven-primary/5' : 'border-haven-border bg-haven-surface focus-within:border-haven-primary/60'
      }`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleImage(e.dataTransfer.files[0]) }}
    >
      {image && (
        <div className="px-4 pt-3 flex items-center gap-2">
          <div className="relative">
            <img src={image.preview} alt="" className="h-12 w-12 rounded-lg object-cover border border-haven-border" />
            <button onClick={() => setImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-haven-card border border-haven-border rounded-full p-0.5 text-haven-dim">
              <X size={10} />
            </button>
          </div>
          <span className="text-xs text-haven-dim">Image attached — AI will analyze it</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3">
        <Shield size={16} className="text-haven-dim flex-shrink-0" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && submit()}
          onPaste={async e => {
            const img = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
            if (img) { e.preventDefault(); handleImage(img.getAsFile()) }
          }}
          placeholder="Search threats, paste a suspicious message, or upload a screenshot..."
          className="flex-1 bg-transparent text-haven-text placeholder-haven-dim text-sm outline-none"
        />
        <button onClick={() => fileRef.current?.click()} title="Attach image"
          className="p-1.5 rounded-lg text-haven-dim hover:text-haven-bright hover:bg-haven-muted/30 transition-colors">
          <ImagePlus size={16} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleImage(e.target.files[0])} />
        <button onClick={submit} disabled={loading || (!text.trim() && !image)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-all">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
        </button>
      </div>

      {!text && !image && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {['Is this a scam?', 'Phishing near me', 'My safety score', 'Crime alerts'].map(h => (
            <button key={h} onClick={() => setText(h)}
              className="text-[11px] text-haven-dim hover:text-haven-sub bg-haven-card px-2.5 py-1 rounded-full border border-haven-border/50 transition-colors">
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Inline Scam Result ───────────────────────────────────────────────────────
function ScamResult({ result, inputText, imagePreview, onDismiss }) {
  const verdict = result?.verdict
  const style = getVerdictStyle(verdict)
  const explanation = result?.explanation || result?.analysis
  const actions = Array.isArray(result?.actions) ? result.actions : []
  // style.bg contains combined bg + border classes e.g. 'bg-red-500/15 border-red-500/40'

  return (
    <div className={`rounded-2xl border overflow-hidden animate-fade-in border-haven-border`}>
      <div className={`flex items-start gap-3 px-5 py-4 ${style?.bg || 'bg-haven-card border-haven-border'}`}>
        {VERDICT_ICON[verdict] || VERDICT_ICON.unclear}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${style?.text || 'text-haven-text'}`}>
            {verdict === 'scam' ? 'Likely a Scam' : verdict === 'legitimate' ? 'Looks Legitimate' : 'Unclear — Exercise Caution'}
          </p>
          {inputText && <p className="text-xs text-haven-dim mt-0.5 truncate">"{inputText}"</p>}
        </div>
        <button onClick={onDismiss} className="text-haven-dim hover:text-haven-sub"><X size={14} /></button>
      </div>

      <div className="px-5 py-4 bg-haven-card space-y-3">
        {result?.source_note && (
          <p className="text-[11px] text-haven-dim bg-haven-surface border border-haven-border rounded-lg px-2.5 py-2">
            {result.source_note}
          </p>
        )}
        {imagePreview && (
          <img src={imagePreview} alt="analyzed" className="h-20 rounded-xl object-cover border border-haven-border" />
        )}
        {explanation && <p className="text-sm text-haven-sub leading-relaxed">{explanation}</p>}
        {result.red_flags?.length > 0 && (
          <ul className="space-y-1">
            {result.red_flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-haven-sub">
                <span className="text-severity-high mt-0.5">•</span>{f}
              </li>
            ))}
          </ul>
        )}
        {actions.length > 0 && (
          <div className="bg-haven-surface rounded-xl px-3 py-2">
            <p className="text-xs uppercase tracking-wider text-haven-dim font-semibold mb-1.5">Recommended Actions</p>
            <ul className="space-y-1.5">
              {actions.map((action, idx) => (
                <li key={idx} className="text-sm text-haven-text">
                  <span>{action.step || action}</span>
                  {action.time_estimate && (
                    <span className="text-xs text-haven-dim"> · {action.time_estimate}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Inline Search Guidance Result ───────────────────────────────────────────
function SearchGuidanceResult({ result, query, onDismiss, onChecklistStepComplete }) {
  const answer = result?.answer || ''

  const actions = Array.isArray(result?.recommended_actions) && result.recommended_actions.length
    ? result.recommended_actions.map((a, idx) => ({
      id: a.id || `a${idx}`,
      title: a.title || `Action ${idx + 1}`,
      why: a.why_this_matters || '',
      steps: (a.protective_checklist || []).map(s => ({
        step: s.step || '',
        time: s.time_estimate || '',
        points: Number(s.score_points || 0),
      })),
      total_points: Number(a.total_score_points || 0),
    }))
    : (result?.actions || []).map((a, idx) => ({
      id: `a${idx}`,
      title: a.title || `Action ${idx + 1}`,
      why: a.why || '',
      steps: (a.steps || []).map(s => ({
        step: s.step || '',
        time: s.time || '',
        points: Number(s.points || 0),
      })),
      total_points: Number(a.total_points || 0),
    }))

  const recommendedActions = actions  // alias for readability below

  const [openActionId, setOpenActionId] = useState(null)
  const [completedSteps, setCompletedSteps] = useState({})

  useEffect(() => {
    setOpenActionId(recommendedActions[0]?.id || null)
    setCompletedSteps({})
  }, [query, result])

  const completeStep = (actionId, stepIndex, scorePoints) => {
    const key = `${actionId}:${stepIndex}`
    if (completedSteps[key]) return
    setCompletedSteps(prev => ({ ...prev, [key]: true }))
    onChecklistStepComplete?.(Number(scorePoints) || 0)
  }

  return (
    <div className="rounded-2xl border border-haven-border overflow-hidden animate-fade-in">
      <div className="flex items-start gap-3 px-5 py-4 bg-haven-card">
        <Lightbulb size={18} className={result?._unknown ? "text-haven-dim mt-0.5" : "text-haven-bright mt-0.5"} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-haven-text">{result?._unknown ? "Not a safety query" : "Safety Guidance"}</p>
          {query && <p className="text-xs text-haven-dim mt-0.5 truncate">"{query}"</p>}
        </div>
        <button onClick={onDismiss} className="text-haven-dim hover:text-haven-sub"><X size={14} /></button>
      </div>

      <div className="px-5 py-4 bg-haven-surface space-y-3">
        {result?.source_note && (
          <p className="text-[11px] text-haven-dim bg-haven-card border border-haven-border rounded-lg px-2.5 py-2">
            {result.source_note}
          </p>
        )}
        {answer && <p className="text-sm text-haven-sub leading-relaxed">{answer}</p>}

        {recommendedActions.length > 0 && (
          <div className="bg-haven-card rounded-xl px-3 py-2">
            <p className="text-xs uppercase tracking-wider text-haven-dim font-semibold mb-2">Recommended Actions</p>
            <div className="space-y-2">
              {recommendedActions.map((action) => {
                const isOpen = openActionId === action.id
                const doneCount = action.steps.filter((_, idx) => completedSteps[`${action.id}:${idx}`]).length
                const total = action.steps.length

                return (
                  <div key={action.id} className="rounded-lg border border-haven-border bg-haven-surface/50">
                    <button
                      onClick={() => setOpenActionId(isOpen ? null : action.id)}
                      className="w-full px-3 py-2 flex items-start justify-between gap-3 text-left"
                    >
                      <div>
                        <p className="text-sm text-haven-text font-medium">{action.title}</p>
                        <p className="text-xs text-haven-dim mt-0.5">
                          {`${action.total_points} pts`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-haven-dim">
                        <span>{doneCount}/{total}</span>
                        {isOpen ? <ChevronRight size={14} className="rotate-90 transition-transform" /> : <ChevronRight size={14} />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2 border-t border-haven-border/60">
                        {action.why && (
                          <p className="text-xs text-haven-sub pt-2">{action.why}</p>
                        )}
                        {action.steps.map((step, idx) => {
                          const key = `${action.id}:${idx}`
                          const done = Boolean(completedSteps[key])
                          return (
                            <button
                              key={key}
                              onClick={() => completeStep(action.id, idx, step.points)}
                              disabled={done}
                              className={`w-full flex items-start gap-2.5 text-left rounded-lg px-2 py-2 transition-all ${
                                done ? 'opacity-60 bg-green-500/5' : 'hover:bg-haven-card'
                              }`}
                            >
                              <span className="pt-0.5">
                                {done ? <CheckCircle2 size={15} className="text-green-400" /> : <Circle size={15} className="text-haven-muted" />}
                              </span>
                              <span className="flex-1">
                                <span className={`text-sm ${done ? 'line-through text-haven-dim' : 'text-haven-text'}`}>{step.step}</span>
                                <span className="block text-[11px] text-haven-dim mt-0.5">
                                  {[step.time, `+${step.points} pts`].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {result?.follow_up && (
          <p className="text-xs text-haven-dim">{result.follow_up}</p>
        )}
      </div>
    </div>
  )
}

// ─── Daily Safety Scoreboard ──────────────────────────────────────────────────
function DailySafetyScoreboard({ cards, loading, completedSteps, onCompleteStep, dailyGoal, maxPoints }) {
  const [openCardId, setOpenCardId] = useState(null)

  useEffect(() => {
    setOpenCardId(cards?.[0]?.id || null)
  }, [cards])

  const donePoints = (cards || []).reduce((sum, card) => {
    const cardPoints = (card.steps || []).reduce((inner, _, idx) => (
      completedSteps[`${card.id}:${idx}`]
        ? inner + Number(card.steps[idx]?.score_points || 0)
        : inner
    ), 0)
    return sum + cardPoints
  }, 0)
  const goal = Number(dailyGoal || 0)
  const max = Number(maxPoints || 0)
  const denominator = goal > 0 ? goal : (max > 0 ? max : 1)
  const progressPct = Math.min(100, Math.round((donePoints / denominator) * 100))

  if (loading) {
    return (
      <div className="bg-haven-card border border-haven-border rounded-2xl p-4">
        <div className="flex justify-center py-6"><Spinner /></div>
      </div>
    )
  }

  if (!cards?.length) {
    return (
      <div className="bg-haven-card border border-haven-border rounded-2xl p-4">
        <p className="text-sm text-haven-sub">No daily check-ins available right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-haven-card border border-haven-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-haven-primary" />
          <div>
            <p className="text-sm font-semibold text-haven-text">Daily Safety Scoreboard</p>
            <p className="text-[11px] text-haven-dim">Resets on reload (MVP)</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-haven-bright">{donePoints}/{goal || max} pts</p>
          <p className="text-[11px] text-haven-dim">Today</p>
        </div>
      </div>

      <div>
        <div className="h-1.5 rounded-full bg-haven-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-haven-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {cards.map((card) => {
          const isOpen = openCardId === card.id
          const doneCount = (card.steps || []).filter((_, idx) => completedSteps[`${card.id}:${idx}`]).length
          const totalCount = (card.steps || []).length

          return (
            <div key={card.id} className="rounded-xl border border-haven-border bg-haven-surface/50">
              <button
                onClick={() => setOpenCardId(isOpen ? null : card.id)}
                className="w-full px-3 py-2 text-left flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-haven-text font-medium">{card.title}</p>
                  <p className="text-[11px] text-haven-dim mt-0.5">
                    {[card.category?.replace('_', ' '), card.time_estimate, `${card.points || 0} pts`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-haven-dim">
                  <span>{doneCount}/{totalCount}</span>
                  {isOpen ? <ChevronRight size={14} className="rotate-90 transition-transform" /> : <ChevronRight size={14} />}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-haven-border/60 space-y-1.5">
                  {card.description && <p className="text-xs text-haven-sub pt-2">{card.description}</p>}
                  {(card.steps || []).map((step, idx) => {
                    const key = `${card.id}:${idx}`
                    const done = Boolean(completedSteps[key])
                    return (
                      <button
                        key={key}
                        onClick={() => onCompleteStep(card.id, idx, Number(step.score_points || 0))}
                        disabled={done}
                        className={`w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                          done ? 'opacity-60 bg-green-500/5' : 'hover:bg-haven-card'
                        }`}
                      >
                        <span className="pt-0.5">
                          {done ? <CheckCircle2 size={15} className="text-green-400" /> : <Circle size={15} className="text-haven-muted" />}
                        </span>
                        <span className="flex-1">
                          <span className={`text-sm ${done ? 'line-through text-haven-dim' : 'text-haven-text'}`}>{step.step}</span>
                          <span className="block text-[11px] text-haven-dim mt-0.5">
                            {[step.time_estimate, step.tooltip, `${step.score_points || 0} pts`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Score Widget for Home ────────────────────────────────────────────────────
function ScoreWidget({ score }) {
  return (
    <div className="w-full bg-haven-card border border-haven-border rounded-2xl px-5 py-4 flex items-center gap-4">
      <ScoreRing score={score?.score ?? 0} size={64} label="" />
      <div className="flex-1 text-left">
        <p className="text-xs text-haven-dim uppercase tracking-wider mb-1">Safety Score</p>
        <p className={`text-2xl font-bold ${getScoreColor(score?.score ?? 0)}`}>
          {score?.score ?? 0}<span className="text-haven-dim text-sm font-normal">/100</span>
        </p>
        <p className="text-xs text-haven-sub mt-0.5">Grows from checklist completion on this page</p>
      </div>
    </div>
  )
}

// ─── Main Home Page ───────────────────────────────────────────────────────────
export default function Home({ clientId, profile, score, onScoreUpdate }) {
  const toast = useToast()

  const [threats, setThreats]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [typeFilter, setType]     = useState('')
  const [sevFilter, setSev]       = useState('')
  const [selected, setSelected]   = useState(null)
  const [reporting, setReporting] = useState(false)
  const [scamResult, setScamResult] = useState(null)
  const [searchGuidance, setSearchGuidance] = useState(null)
  const [liveScore, setLiveScore] = useState(score || null)
  const [dailyCards, setDailyCards] = useState([])
  const [dailyLoading, setDailyLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(0)
  const [dailyMaxPoints, setDailyMaxPoints] = useState(0)
  const [dailyCompletedSteps, setDailyCompletedSteps] = useState({})

  useEffect(() => {
    setLiveScore(score || null)
  }, [score])

  const applyChecklistScore = useCallback((points) => {
    const gain = Number(points || 0)
    if (!gain || gain <= 0) return

    setLiveScore((prev) => {
      const current = Number(prev?.score ?? prev?.total ?? 0)
      const updated = Math.min(100, current + gain)
      const next = {
        ...(prev || {}),
        score: updated,
        total: updated,
        rating: deriveScoreRating(updated),
      }
      onScoreUpdate?.(next)
      return next
    })

    toast(`Score improved by +${gain}`, 'success')
  }, [onScoreUpdate, toast])

  const loadDailyCheckins = useCallback(async () => {
    setDailyLoading(true)
    try {
      const res = await getDailyCheckins(clientId, 4)
      setDailyCards(res.cards || [])
      setDailyGoal(Number(res.daily_goal || 0))
      setDailyMaxPoints(Number(res.max_points || 0))
      setDailyCompletedSteps({})
    } catch {
      toast('Failed to load daily check-ins', 'error')
      setDailyCards([])
      setDailyGoal(0)
      setDailyMaxPoints(0)
    } finally {
      setDailyLoading(false)
    }
  }, [clientId, toast])

  const completeDailyStep = useCallback((cardId, stepIndex, points) => {
    const key = `${cardId}:${stepIndex}`
    let newlyCompleted = false
    setDailyCompletedSteps((prev) => {
      if (prev[key]) return prev
      newlyCompleted = true
      return { ...prev, [key]: true }
    })
    if (newlyCompleted) {
      applyChecklistScore(points)
    }
  }, [applyChecklistScore])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        client_id: clientId,
        type: typeFilter || undefined,
        severity: sevFilter || undefined,
      }

      // Default feed is contextual to the user, not a global platform dump.
      if (profile?.location) {
        params.location = profile.location
      }

      const res = await getThreats(params)
      const severityRank = { critical: 0, high: 1, medium: 2, low: 3 }
      const ordered = [...(res.threats || [])].sort(
        (a, b) => (severityRank[a.severity] ?? 4) - (severityRank[b.severity] ?? 4)
      )
      setThreats(ordered)
    } catch {
      toast('Failed to load threats', 'error')
    } finally {
      setLoading(false)
    }
  }, [clientId, profile?.location, sevFilter, typeFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadDailyCheckins() }, [loadDailyCheckins])

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-haven-text mb-0.5">
          {profile?.name ? `Stay safe, ${profile.name.split(' ')[0]}` : 'Haven'}
        </h1>
        <p className="text-haven-sub text-sm">
          {profile?.location ? `Threats & safety intel near ${profile.location}` : 'Your AI-powered community safety platform'}
        </p>
      </div>

      {/* Unified Smart Search */}
      <SmartSearch
        clientId={clientId}
        onSearchGuidance={(result, query) => { setSearchGuidance({ result, query }); setScamResult(null) }}
        onScamResult={(r, t, img) => { setScamResult({ result: r, text: t, image: img }); setSearchGuidance(null) }}
        onLoading={setAiLoading}
      />

      {/* Inline scam result */}
      {scamResult && (
        <ScamResult
          result={scamResult.result}
          inputText={scamResult.text}
          imagePreview={scamResult.image}
          onDismiss={() => setScamResult(null)}
        />
      )}
      {searchGuidance && (
        <SearchGuidanceResult
          result={searchGuidance.result}
          query={searchGuidance.query}
          onChecklistStepComplete={applyChecklistScore}
          onDismiss={() => setSearchGuidance(null)}
        />
      )}

      {/* Score + Filters row */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
        <FilterPills
          type={typeFilter} severity={sevFilter}
          onType={setType}
          onSeverity={setSev}
        />
        <button onClick={() => setReporting(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-haven-surface border border-haven-border hover:border-haven-primary/50 text-haven-sub hover:text-haven-bright text-sm rounded-xl transition-all whitespace-nowrap">
          <Plus size={14} /> Report
        </button>
      </div>

      {/* Score widget */}
      <ScoreWidget score={liveScore} />

      <DailySafetyScoreboard
        cards={dailyCards}
        loading={dailyLoading}
        completedSteps={dailyCompletedSteps}
        onCompleteStep={completeDailyStep}
        dailyGoal={dailyGoal}
        maxPoints={dailyMaxPoints}
      />

      {profile?.location && (
        <p className="text-xs text-haven-dim">
          Showing threats near <span className="text-haven-sub">{profile.location}</span>
        </p>
      )}

      {/* Threat feed */}
      {loading || aiLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !threats.length ? (
        <EmptyState icon={Shield} title="No threats reported"
          description="Your community looks safe right now." />
      ) : (
        <div className="space-y-2.5">
          {threats.map(t => <ThreatCard key={t.id} threat={t} onClick={setSelected} />)}
          <p className="text-center text-xs text-haven-dim pt-1">{threats.length} threat{threats.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {selected && (
        <ThreatDetail
          threat={selected}
          clientId={clientId}
          onClose={() => setSelected(null)}
          onToast={toast}
          onScoreUpdate={(s) => {
            if (s?.score != null) {
              setLiveScore(prev => ({ ...(prev || {}), score: s.score, total: s.score }))
              onScoreUpdate?.({ ...(liveScore || {}), score: s.score, total: s.score })
            }
          }}
        />
      )}
      {reporting && (
        <ReportThreatModal
          defaultLocation={profile?.location}
          onClose={() => setReporting(false)}
          onSuccess={threat => { setThreats(p => [threat, ...p]); setReporting(false); toast('Reported!', 'success') }}
        />
      )}
    </div>
  )
}
