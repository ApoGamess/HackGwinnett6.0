import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../state/AppContext'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useApp()
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement as HTMLElement | null
    // Stop audio before its controls become unavailable behind the dialog.
    // Playback within this dialog still requires an explicit Speak action.
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={event => { event.preventDefault(); event.stopPropagation(); closeRef.current() }} onKeyDown={event => {
    event.stopPropagation()
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])')].filter(element => {
      if (!element.getClientRects().length || element.tabIndex < 0 || element.closest('dialog') !== event.currentTarget || getComputedStyle(element).visibility === 'hidden') return false
      // Closed details can retain layout rectangles in Chromium. Only their
      // summary participates in tab order; hidden descendants must be excluded.
      for (let parent = element.parentElement; parent && parent !== event.currentTarget; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false
      }
      return true
    })
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t('Close dialog')} onClick={onClose}><X size={21} aria-hidden="true" /></button></div>
    <div className="modal-content">{children}</div>
  </dialog>
}
export default Modal

