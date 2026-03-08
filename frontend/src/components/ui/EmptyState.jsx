export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && <Icon size={48} className="text-haven-dim mb-4" strokeWidth={1} />}
      <h3 className="text-haven-text font-semibold text-lg mb-2">{title}</h3>
      {description && <p className="text-haven-sub text-sm max-w-xs">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
