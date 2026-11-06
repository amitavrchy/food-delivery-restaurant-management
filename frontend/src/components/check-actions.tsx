'use client';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { Table } from '@/lib/types';
export function CheckActions({
  checkId,
  tables,
  onMoved,
}: {
  checkId: string;
  tables: Table[];
  onMoved: () => void;
}) {
  const [action, setAction] = useState('move');
  const { run, busy } = useAction();
  return (
    <details className="section-gap">
      <summary>Manage check</summary>
      <form
        className="form-stack section-gap"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body =
            action === 'discount'
              ? {
                  type: 'PERCENT',
                  value: Number(f.get('value')),
                  reason: f.get('reason'),
                  managerPin: f.get('pin'),
                }
              : action === 'move'
                ? { targetTableId: f.get('target') }
                : { targetCheckId: f.get('target') };
          if (await run(() => post(`pos/checks/${checkId}/${action}`, body), 'Check updated.')) {
            if (action !== 'discount') onMoved();
          }
        }}
      >
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="move">Move table</option>
            <option value="merge">Merge into another check (manager)</option>
            <option value="discount">Apply discount (manager)</option>
          </select>
        </label>
        {action === 'discount' ? (
          <>
            <label>
              Discount percentage
              <input name="value" type="number" min="0" max="100" required />
            </label>
            <label>
              Reason
              <input name="reason" minLength={5} maxLength={300} required />
            </label>
            <label>
              Manager PIN
              <input name="pin" type="password" required autoComplete="off" />
            </label>
          </>
        ) : (
          <label>
            Destination
            <select name="target" required>
              <option value="">Choose table</option>
              {tables
                .filter((t) =>
                  action === 'move'
                    ? !t.checks.length
                    : !!t.checks.length && t.checks[0].id !== checkId,
                )
                .map((t) => (
                  <option key={t.id} value={action === 'move' ? t.id : t.checks[0].id}>
                    {t.code}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button disabled={busy} className="btn secondary">
          Apply change
        </button>
      </form>
    </details>
  );
}
