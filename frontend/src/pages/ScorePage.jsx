import { useState, useEffect } from 'react'
import { BarChart3, ChevronRight, ChevronLeft, Loader2, RefreshCw, Lightbulb, TrendingUp } from 'lucide-react'
import { submitScore, getScore, getScoreRecommendations } from '../api'
import ScoreRing from '../components/ScoreRing'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { getScoreColor } from '../utils/helpers'
import { useToast } from '../components/ui/Toast'

// These IDs + values MUST exactly match backend validation in routes/ai.py
const QUESTIONS = [
  {
    id: 'password_habits',
    text: 'How do you manage your passwords?',
    hint: 'Each account should have a unique, strong password.',
    options: [
      { value: 'unique',  label: 'Unique password for every account' },
      { value: 'mixed',   label: 'Some reuse, mostly different' },
      { value: 'reused',  label: 'Same password on multiple sites' },
    ],
  },
  {
    id: 'two_factor_auth',
    text: 'Do you use two-factor authentication (2FA)?',
    hint: 'Enabled on email, banking, and key accounts.',
    options: [
      { value: 'all',  label: 'Yes — on all important accounts' },
      { value: 'some', label: 'On some accounts' },
      { value: 'none', label: 'No, not set up' },
    ],
  },
  {
    id: 'software_updates',
    text: 'How current is your device software?',
    hint: 'OS, browser, and app updates contain security patches.',
    options: [
      { value: 'current',   label: 'Always update promptly' },
      { value: 'sometimes', label: 'Update occasionally' },
      { value: 'rarely',    label: 'Rarely or never update' },
    ],
  },
  {
    id: 'local_awareness',
    text: 'How aware are you of safety threats in your area?',
    hint: 'Local scams, crime patterns, and community alerts.',
    options: [
      { value: 'high',   label: 'Very aware — I follow local news' },
      { value: 'medium', label: 'Somewhat aware' },
      { value: 'low',    label: 'Not very aware' },
    ],
  },
  {
    id: 'physical_security',
    text: 'How secure is your physical environment?',
    hint: 'Home locks, shared spaces, valuables in public.',
    options: [
      { value: 'high',   label: 'Well secured' },
      { value: 'medium', label: 'Reasonably secure' },
      { value: 'low',    label: 'Could be improved' },
    ],
  },
  {
    id: 'emergency_prep',
    text: 'How prepared are you for emergencies?',
    hint: 'Backup contacts, evacuation plan, emergency kit.',
    options: [
      { value: 'prepared',   label: 'Fully prepared' },
      { value: 'partial',    label: 'Partially prepared' },
      { value: 'unprepared', label: 'Not prepared' },
    ],
  },
]

export default function ScorePage({ clientId, profile, onScoreUpdate }) {
  const toast = useToast()

  const [mode, setMode]       = useState('loading')
  const [qIdx, setQIdx]       = useState(0)
  const [answers, setAnswers] = useState({})
  const [scoreData, setScore] = useState(null)
  const [recs, setRecs]       = useState(null)
  const [recSourceNote, setRecSourceNote] = useState('')
  const [recsLoading, setRL]  = useState(false)
  const [submitting, setSub]  = useState(false)

  useEffect(() => {
    getScore(clientId)
      .then(res => {
        if (res.latest) {
          const data = { score: res.latest.total, ...res.latest }
          setScore(data)
          setMode('result')
          onScoreUpdate?.(data)
        } else {
          setMode('quiz')
        }
      })
      .catch(() => setMode('quiz'))
  }, [clientId])

  const answer = (id, val) => {
    setAnswers(prev => ({ ...prev, [id]: val }))
    if (qIdx < QUESTIONS.length - 1) {
      setTimeout(() => setQIdx(i => i + 1), 180)
    }
  }

  const submit = async () => {
    if (Object.keys(answers).length < QUESTIONS.length) {
      toast('Please answer all questions', 'warning'); return
    }
    setSub(true)
    try {
      const res = await submitScore(clientId, answers)
      const data = { score: res.total, ...res }
      setScore(data)
      setMode('result')
      onScoreUpdate?.(data)
      toast(`Score: ${res.total}/100 — ${res.rating}`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to calculate score', 'error')
    } finally {
      setSub(false)
    }
  }

  const loadRecs = async () => {
    setMode('recs')
    setRL(true)
    try {
      const res = await getScoreRecommendations(clientId, profile?.location)
      setRecs(Array.isArray(res.recommendations) ? res.recommendations : [])
      setRecSourceNote(res.source_note || '')
    } catch {
      toast('Failed to load recommendations', 'error')
    } finally {
      setRL(false)
    }
  }

  const retake = () => { setAnswers({}); setQIdx(0); setScore(null); setRecs(null); setRecSourceNote(''); setMode('quiz') }

  if (mode === 'loading') return <div className="flex justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-haven-primary/15 border border-haven-primary/30 flex items-center justify-center">
          <BarChart3 size={18} className="text-haven-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-haven-text">Safety Score</h1>
          <p className="text-haven-sub text-sm">6 questions — understand your security posture</p>
        </div>
      </div>

      {/* Quiz */}
      {mode === 'quiz' && (
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-xs text-haven-dim mb-2">
              <span>Question {qIdx + 1} of {QUESTIONS.length}</span>
              <span>{Object.keys(answers).length} answered</span>
            </div>
            <div className="h-1.5 rounded-full bg-haven-muted/30 overflow-hidden">
              <div className="h-full rounded-full bg-haven-primary transition-all duration-300"
                style={{ width: `${((qIdx) / QUESTIONS.length) * 100}%` }} />
            </div>
          </div>

          <div className="bg-haven-card border border-haven-border rounded-2xl p-6 animate-fade-in">
            <p className="text-base font-semibold text-haven-text mb-1">{QUESTIONS[qIdx].text}</p>
            <p className="text-xs text-haven-dim mb-5">{QUESTIONS[qIdx].hint}</p>
            <div className="space-y-2">
              {QUESTIONS[qIdx].options.map(o => {
                const sel = answers[QUESTIONS[qIdx].id] === o.value
                return (
                  <button
                    key={o.value}
                    onClick={() => answer(QUESTIONS[qIdx].id, o.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${
                      sel
                        ? 'bg-haven-primary/15 border-haven-primary text-haven-bright'
                        : 'bg-haven-surface border-haven-border text-haven-sub hover:border-haven-muted hover:text-haven-text'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      sel ? 'border-haven-primary bg-haven-primary' : 'border-haven-muted'
                    }`}>
                      {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setQIdx(i => Math.max(0, i - 1))} disabled={qIdx === 0}
              className="flex items-center gap-1 text-sm text-haven-dim hover:text-haven-sub disabled:opacity-30 transition-colors">
              <ChevronLeft size={16} /> Previous
            </button>
            {qIdx < QUESTIONS.length - 1 ? (
              <button onClick={() => setQIdx(i => i + 1)} disabled={!answers[QUESTIONS[qIdx].id]}
                className="flex items-center gap-1.5 px-4 py-2 bg-haven-surface border border-haven-border hover:border-haven-primary/40 text-sm text-haven-sub hover:text-haven-text rounded-xl disabled:opacity-30 transition-all">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={submit} disabled={Object.keys(answers).length < QUESTIONS.length || submitting}
                className="flex items-center gap-2 px-5 py-2 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Calculate Score
              </button>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {mode === 'result' && scoreData && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-haven-card border border-haven-border rounded-2xl p-8 flex flex-col items-center gap-5">
            <ScoreRing score={scoreData.score} size={160} />
            <div className="text-center">
              <p className={`text-lg font-bold ${getScoreColor(scoreData.score)}`}>
                {scoreData.rating || (
                  scoreData.score >= 80 ? 'Excellent' :
                  scoreData.score >= 60 ? 'Good' :
                  scoreData.score >= 40 ? 'Fair' : 'At Risk'
                )}
              </p>
            </div>

            {/* Sub-scores */}
            {(scoreData.digital_hygiene !== undefined || scoreData.local_awareness !== undefined) && (
              <div className="w-full grid grid-cols-2 gap-3 pt-3 border-t border-haven-border">
                {scoreData.digital_hygiene !== undefined && (
                  <div className="bg-haven-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-haven-dim mb-1">Digital Hygiene</p>
                    <p className={`text-xl font-bold ${getScoreColor(scoreData.digital_hygiene)}`}>{scoreData.digital_hygiene}</p>
                  </div>
                )}
                {scoreData.local_awareness !== undefined && (
                  <div className="bg-haven-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-haven-dim mb-1">Local Awareness</p>
                    <p className={`text-xl font-bold ${getScoreColor(scoreData.local_awareness)}`}>{scoreData.local_awareness}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={loadRecs}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-haven-primary hover:bg-haven-glow text-white text-sm font-semibold rounded-xl transition-all">
              <Lightbulb size={15} /> AI Recommendations
            </button>
            <button onClick={retake}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-haven-surface border border-haven-border hover:border-haven-primary/40 text-haven-sub hover:text-haven-text text-sm font-medium rounded-xl transition-all">
              <RefreshCw size={14} /> Retake
            </button>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {mode === 'recs' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-haven-text flex items-center gap-2">
              <Lightbulb size={16} className="text-haven-primary" /> AI Recommendations
            </h2>
            <button onClick={() => setMode('result')} className="text-sm text-haven-dim hover:text-haven-sub transition-colors">← Back</button>
          </div>
          {recsLoading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Spinner size="lg" />
              <p className="text-haven-sub text-sm">Analyzing your profile...</p>
            </div>
          ) : recs?.length ? (
            <div className="space-y-3">
              {recSourceNote && (
                <p className="text-xs text-haven-dim bg-haven-surface border border-haven-border rounded-xl px-3 py-2">
                  {recSourceNote}
                </p>
              )}
              {recs.map((rec, idx) => (
                <div key={idx} className="bg-haven-card border border-haven-border rounded-2xl p-4">
                  <p className="text-sm font-medium text-haven-text">{rec.action}</p>
                  <p className="text-xs text-haven-dim mt-1">
                    {rec.score_impact || 'Impact pending'} · {rec.time_estimate || 'Quick step'}
                  </p>
                  {rec.reason && <p className="text-xs text-haven-sub mt-1.5">{rec.reason}</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Lightbulb} title="No recommendations found" />
          )}
        </div>
      )}
    </div>
  )
}
