import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Shield, AlertTriangle, CheckCircle, HelpCircle, X, Loader2, ImagePlus, ArrowRight, ChevronRight } from 'lucide-react'
import { getThreats, detectIntent, analyzeScam } from '../api'
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

// ─── Unified Smart Search Bar ─────────────────────────────────────────────────
function SmartSearch({ clientId, onSearch, onScamResult, onLoading }) {
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
        navigate('/score')
      } else if (intent === 'digest' || routeTo === 'digest') {
        navigate('/digest')
      } else {
        // Default: search threat feed from backend.
        onSearch?.(query)
      }
    } catch {
      // Fallback: treat as threat search
      onSearch?.(text)
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

// ─── Score Widget for Home ────────────────────────────────────────────────────
function ScoreWidget({ score, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full bg-haven-card border border-haven-border hover:border-haven-primary/40 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all group">
      <ScoreRing score={score?.score} size={64} label="" />
      <div className="flex-1 text-left">
        <p className="text-xs text-haven-dim uppercase tracking-wider mb-1">Safety Score</p>
        {score ? (
          <>
            <p className={`text-2xl font-bold ${getScoreColor(score.score)}`}>{score.score}<span className="text-haven-dim text-sm font-normal">/100</span></p>
            <p className="text-xs text-haven-sub mt-0.5">{score.rating || 'View details'}</p>
          </>
        ) : (
          <>
            <p className="text-haven-sub text-sm font-medium">Not calculated yet</p>
            <p className="text-xs text-haven-dim mt-0.5">Take the 6-question quiz</p>
          </>
        )}
      </div>
      <ChevronRight size={16} className="text-haven-dim group-hover:text-haven-bright group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}

// ─── Main Home Page ───────────────────────────────────────────────────────────
export default function Home({ clientId, profile, score }) {
  const toast = useToast()
  const navigate = useNavigate()

  const [threats, setThreats]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [typeFilter, setType]     = useState('')
  const [sevFilter, setSev]       = useState('')
  const [searchText, setSearch]   = useState('')
  const [selected, setSelected]   = useState(null)
  const [reporting, setReporting] = useState(false)
  const [scamResult, setScamResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        client_id: clientId,
        type: typeFilter || undefined,
        severity: sevFilter || undefined,
        search: searchText || undefined,
      }

      // Default feed is contextual to the user, not a global platform dump.
      if (!searchText && profile?.location) {
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
  }, [clientId, profile?.location, searchText, sevFilter, typeFilter])

  useEffect(() => { load() }, [load])

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
        onSearch={t => { setSearch((t || '').trim()); setScamResult(null) }}
        onScamResult={(r, t, img) => { setScamResult({ result: r, text: t, image: img }); setSearch('') }}
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
      <ScoreWidget score={score} onClick={() => navigate('/score')} />

      {/* Search label */}
      {searchText && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-haven-sub">Results for <span className="text-haven-bright font-medium">"{searchText}"</span></p>
          <button onClick={() => setSearch('')} className="text-xs text-haven-dim hover:text-haven-sub">Clear</button>
        </div>
      )}
      {!searchText && profile?.location && (
        <p className="text-xs text-haven-dim">
          Showing threats near <span className="text-haven-sub">{profile.location}</span>
        </p>
      )}

      {/* Threat feed */}
      {loading || aiLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !threats.length ? (
        <EmptyState icon={Shield} title={searchText ? 'No matching threats' : 'No threats reported'}
          description={searchText ? 'Try a different search' : 'Your community looks safe right now.'} />
      ) : (
        <div className="space-y-2.5">
          {threats.map(t => <ThreatCard key={t.id} threat={t} onClick={setSelected} />)}
          <p className="text-center text-xs text-haven-dim pt-1">{threats.length} threat{threats.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {selected && (
        <ThreatDetail threat={selected} clientId={clientId} onClose={() => setSelected(null)} onToast={toast} />
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
