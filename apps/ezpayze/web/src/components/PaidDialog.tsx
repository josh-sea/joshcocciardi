// "How did they pay?" One tap on a method marks it paid. The date defaults to
// today and can be changed first.

import { useState } from 'react';
import { enabledMethods, METHOD_CATALOG } from '@shared/methods';
import { formatMoney } from '@shared/money';
import type { EzUser, Payment } from '@shared/types';
import { Dialog } from './Dialog';
import { Field } from './Field';

export function PaidDialog({ payment, profile, today, onClose, onConfirm }: {
  payment: (Payment & { id: string }) | null;
  profile: EzUser;
  today: string;
  onClose: () => void;
  onConfirm: (paidVia: string | null, paidAt: string) => void;
}) {
  const [date, setDate] = useState(today);
  const methods = enabledMethods(profile.paymentMethods);
  const extra = METHOD_CATALOG.filter((m) => ['cash', 'check'].includes(m.type) && !methods.some((x) => x.type === m.type));
  const choices = [...methods.map((m) => ({ type: m.type, label: m.label })), ...extra.map((m) => ({ type: m.type, label: m.label }))];
  return (
    <Dialog open={!!payment} title="How did they pay?" onClose={onClose}>
      {payment && (
        <>
          <p className="lead">
            <strong>{payment.customerName}</strong>, {payment.jobTitle}, {formatMoney(payment.amount)}
          </p>
          <Field label="Date paid" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          <div className="stack">
            {choices.map((c) => (
              <button key={c.type} type="button" className="btn good big block" onClick={() => onConfirm(c.type, date)}>
                {c.label}
              </button>
            ))}
            <button type="button" className="btn secondary big block" onClick={() => onConfirm(null, date)}>
              Some other way / not sure
            </button>
            <button type="button" className="btn plain block" onClick={onClose}>
              Cancel, not paid yet
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
