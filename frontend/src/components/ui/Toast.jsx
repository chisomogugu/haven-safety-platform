import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
  error:   <XCircle    size={18} className="text-red-400 flex-shrink-0" />,
  info:    <Info        size={18} className="text-haven-bright flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-orange-400 flex-shrink-0" />,
}

const STYLES = {
  success: 'border-green-500/30 bg-green-500/10',
  error:   'border-red-500/30 bg-red-500/10',
  info:    'border-haven-primary/30 bg-haven-primary/10',
  warning: 'border-orange-500/30 bg-orange-500/10',
}

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`animate-slide-up flex items-start gap-3 px-4 py-3 rounded-xl border shadow-card backdrop-blur-sm pointer-events-auto ${STYLES[t.type]} bg-haven-surface`}
          >
            {ICONS[t.type]}
            <span className="text-sm text-haven-text flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-haven-dim hover:text-haven-sub mt-0.5">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
