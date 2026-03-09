import { useState, useRef, useCallback } from 'react'
import { Search, ImagePlus, X, Loader2, ArrowRight } from 'lucide-react'
import { detectIntent } from '../api'
import { readFileAsBase64 } from '../utils/helpers'
import { useNavigate } from 'react-router-dom'

export default function SearchBar({ clientId, onIntent, placeholder = 'Search threats, ask about scams, check safety...' }) {
  const [text, setText]         = useState('')
  const [image, setImage]       = useState(null)  // { b64, preview }
  const [loading, setLoading]   = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()

  const handleImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const b64 = await readFileAsBase64(file)
    const preview = URL.createObjectURL(file)
    setImage({ b64, preview })
  }, [])

  const onFileChange = (e) => handleImage(e.target.files[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleImage(e.dataTransfer.files[0])
  }

  const onPaste = useCallback((e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (imgItem) handleImage(imgItem.getAsFile())
  }, [handleImage])

  const submit = async () => {
    if (!text.trim() && !image) return
    setLoading(true)
    try {
      const res = await detectIntent(text, image?.b64, clientId)
      const intent = res.intent

      if (onIntent) onIntent(intent, text)

      // Route based on detected intent
      if (intent === 'scam_check') {
        navigate('/analyze', { state: { prefill: text, image: image?.b64 } })
      } else if (intent === 'score' || intent === 'score_check') {
        navigate('/score')
      } else if (intent === 'digest') {
        navigate('/digest')
      }
      // else: 'threat_search' — parent handles filtering via onIntent callback
    } catch {
      if (onIntent) onIntent('threat_search', text)
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 ${
        dragOver
          ? 'border-haven-primary bg-haven-primary/5 shadow-[0_0_0_3px_rgba(139,92,246,0.2)]'
          : 'border-haven-border bg-haven-surface hover:border-haven-muted focus-within:border-haven-primary focus-within:shadow-[0_0_0_2px_rgba(139,92,246,0.15)]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Image preview strip */}
      {image && (
        <div className="px-4 pt-3 pb-0 flex items-center gap-2">
          <div className="relative inline-block">
            <img src={image.preview} alt="upload" className="h-16 w-16 rounded-lg object-cover border border-haven-border" />
            <button
              onClick={() => setImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-haven-card border border-haven-border rounded-full p-0.5 text-haven-sub hover:text-haven-text"
            >
              <X size={12} />
            </button>
          </div>
          <span className="text-xs text-haven-dim">Image attached · AI will analyze it</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3">
        <Search size={18} className="text-haven-dim flex-shrink-0" />

        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-haven-text placeholder-haven-dim text-sm outline-none"
        />

        {/* Image upload button */}
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach image (or paste/drop)"
          className="p-1.5 rounded-lg text-haven-dim hover:text-haven-bright hover:bg-haven-muted/30 transition-colors"
        >
          <ImagePlus size={17} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

        {/* Submit */}
        <button
          onClick={submit}
          disabled={loading || (!text.trim() && !image)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-all disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          <span className="hidden sm:inline">{loading ? 'Thinking...' : 'Ask'}</span>
        </button>
      </div>

      {/* Hint */}
      {!image && !text && (
        <div className="px-4 pb-2.5 flex gap-3">
          {['Is this email a scam?', 'Phishing near me', 'My safety score'].map(hint => (
            <button
              key={hint}
              onClick={() => setText(hint)}
              className="text-[11px] text-haven-dim hover:text-haven-sub bg-haven-card px-2 py-0.5 rounded-full border border-haven-border/50 transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
