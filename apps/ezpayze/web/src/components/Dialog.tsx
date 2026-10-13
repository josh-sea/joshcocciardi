// Native <dialog>: focus is trapped and Escape closes it for free.
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
