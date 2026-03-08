import { useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Scan, ImagePlus, X, AlertTriangle, CheckCircle, HelpCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { analyzeScam } from '../api'
import { readFileAsBase64, getVerdictStyle } from '../utils/helpers'
import { useToast } from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'

const VERDICT_ICON = {
  scam:        <AlertTriangle size={20} className="text-verdict-scam" />,
  legitimate:  <CheckCircle  size={20} className="text-verdict-legitimate" />,
  unclear:     <HelpCircle   size={20} className="text-verdict-unclear" />,
}

export default function AnalyzePage({ clientId }) {
  const toast = useToast()
  const navState = useLocation().state || {}

  const [text, setText]       = useState(navState.prefill || '')
  const [image, setImage]     = useState(navState.image ? { b64: navState.image, preview: null } : null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const handleImage = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) return
    const b64 = await readFileAsBase64(file)
    setImage({ b64, preview: URL.createObjectURL(file) })
  }, [])

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleImage(e.dataTransfer.files[0]) }

  const analyze = async () => {
    if (!text.trim() && !image) { toast('Enter text or attach an image', 'warning'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await analyzeScam(text, image?.b64, clientId)
      setResult(res)
    } catch (err) {
      toast(err.message || 'Analysis failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const verdict = result?.verdict
  const verdictStyle = verdict ? getVerdictStyle(verdict) : null
  const explanation = result?.explanation || result?.analysis
  const actions = Array.isArray(result?.actions) ? result.actions : []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="pt-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-haven-primary/15 border border-haven-primary/30 flex items-center justify-center">
            <Scan size={18} className="text-haven-primary" />
          </div>
          <h1 className="text-2xl font-bold text-haven-text">Scam Analyzer</h1>
        </div>
        <p className="text-haven-sub text-sm ml-12">
          Paste suspicious text, upload a screenshot, or describe what you received.
        </p>
      </div>

      {/* Input card */}
      <div
        className={`rounded-2xl border transition-all ${
          dragOver ? 'border-haven-primary bg-haven-primary/5' : 'border-haven-border bg-haven-surface'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* Image preview */}
        {image?.preview && (
          <div className="px-4 pt-4 flex items-start gap-3">
            <div className="relative">
              <img src={image.preview} alt="preview" className="h-24 w-24 rounded-xl object-cover border border-haven-border" />
              <button
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-haven-card border border-haven-border rounded-full p-0.5 text-haven-sub hover:text-severity-critical transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            <div className="pt-1">
              <p className="text-xs font-medium text-haven-text">Image attached</p>
              <p className="text-xs text-haven-dim mt-0.5">AI will analyze the visual content</p>
            </div>
          </div>
        )}

        {/* Text area */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Paste the suspicious message here...\n\nYou can also drag & drop or paste an image`}
          rows={7}
          className="w-full px-4 py-4 bg-transparent text-haven-text placeholder-haven-dim text-sm outline-none resize-none"
          onPaste={async e => {
            const items = Array.from(e.clipboardData?.items || [])
            const img = items.find(i => i.type.startsWith('image/'))
            if (img) { e.preventDefault(); handleImage(img.getAsFile()) }
          }}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 pb-3 border-t border-haven-border/50 pt-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-haven-dim hover:text-haven-bright transition-colors"
          >
            <ImagePlus size={14} />
            {image ? 'Change image' : 'Attach image'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleImage(e.target.files[0])} />

          <button
            onClick={analyze}
            disabled={loading || (!text.trim() && !image)}
            className="flex items-center gap-2 px-4 py-2 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Result */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-haven-primary/10 border border-haven-primary/20 flex items-center justify-center">
              <Scan size={24} className="text-haven-primary animate-pulse" />
            </div>
          </div>
          <p className="text-haven-sub text-sm">AI is analyzing for red flags...</p>
        </div>
      )}

      {result && !loading && (
        <div className="rounded-2xl border border-haven-border bg-haven-card overflow-hidden animate-fade-in">
          {/* Verdict header */}
          <div className={`flex items-center gap-3 px-5 py-4 border-b border-haven-border/50 ${verdictStyle?.bg || ''}`}>
            {VERDICT_ICON[verdict] || VERDICT_ICON.unclear}
            <div>
              <div className={`text-base font-bold capitalize ${verdictStyle?.text || 'text-haven-text'}`}>
                {verdict === 'scam' ? 'Likely a Scam' : verdict === 'legitimate' ? 'Looks Legitimate' : 'Unclear — Exercise Caution'}
              </div>
              {result.confidence !== undefined && (
                <div className="text-xs text-haven-dim">
                  {Math.round(result.confidence * 100)}% confidence
                </div>
              )}
            </div>
          </div>

          {/* Analysis */}
          <div className="px-5 py-4 space-y-4">
            {result.source_note && (
              <p className="text-xs text-haven-dim bg-haven-surface border border-haven-border rounded-lg px-3 py-2">
                {result.source_note}
              </p>
            )}
            {explanation && (
              <div>
                <h3 className="text-xs font-semibold text-haven-dim uppercase tracking-wider mb-2">Analysis</h3>
                <p className="text-sm text-haven-sub leading-relaxed">{explanation}</p>
              </div>
            )}

            {/* Red flags */}
            {result.red_flags?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-haven-dim uppercase tracking-wider mb-2">Red Flags</h3>
                <ul className="space-y-1.5">
                  {result.red_flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-haven-sub">
                      <span className="text-severity-high mt-0.5 flex-shrink-0">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended actions */}
            {actions.length > 0 && (
              <div className="bg-haven-surface rounded-xl px-4 py-3">
                <h3 className="text-xs font-semibold text-haven-dim uppercase tracking-wider mb-1">Recommended Actions</h3>
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

            {/* Raw toggle */}
            {result.raw && (
              <button
                onClick={() => setShowRaw(r => !r)}
                className="flex items-center gap-1 text-xs text-haven-dim hover:text-haven-sub transition-colors"
              >
                {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showRaw ? 'Hide' : 'Show'} raw AI output
              </button>
            )}
            {showRaw && result.raw && (
              <pre className="text-xs text-haven-dim bg-haven-surface rounded-xl p-3 overflow-auto whitespace-pre-wrap">{result.raw}</pre>
            )}
          </div>
        </div>
      )}

      {!result && !loading && (
        <EmptyState
          icon={Scan}
          title="Paste something suspicious"
          description="Text messages, emails, links, screenshots — AI will tell you if it's a scam."
        />
      )}
    </div>
  )
}
