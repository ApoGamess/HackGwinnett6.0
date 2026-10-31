import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Tone = 'teal' | 'purple' | 'peach' | 'neutral'
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props} />
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1><p className="page-description">{description}</p></div>{children}</div>
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
export function IconTile({ icon: Icon, tone = 'teal' }: { icon: LucideIcon; tone?: Tone }) {
  return <span className={`icon-tile icon-tile-${tone}`}><Icon size={23} aria-hidden="true" strokeWidth={1.7} /></span>
}
export function EmptyState({ icon: Icon, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state">{Icon && <Icon size={32} aria-hidden="true" />}<h3>{title}</h3><p className="muted">{description}</p>{children}</div>
}
