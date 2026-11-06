'use client';
import { useState } from 'react';
import { CheckCheck, Headphones, MessageSquare } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, label, money, patch, post, time } from '@/lib/api';
import { formNumber, formText, type SupportCase } from '@/lib/advanced';
export default function SupportDesk() {
  const { user, restaurantId } = useApp();
  const { data, error, loading } = useResource<SupportCase[]>(
    user ? `support?restaurantId=${restaurantId}` : null,
  );
  const { run, busy } = useAction();
  const [tab, setTab] = useState('Open cases'),
    [selected, setSelected] = useState<string | null>(null),
    [resolution, setResolution] = useState(false);
  const ticket = data?.find((t) => t.id === selected);
  const cases = (data || []).filter(
    (c) =>
      tab === 'All cases' ||
      (tab === 'Resolved' ? c.status === 'RESOLVED' : c.status !== 'RESOLVED'),
  );
  return (
    <>
      <PageHeading
        eyebrow="GUEST EXPERIENCE & RESOLUTION"
        title="Keep every conversation moving toward better."
        description="Order-linked support, a shared thread and an accountable resolution trail."
      >
        <span className="date-chip">
          <Headphones size={18} />
          {data?.filter((c) => c.status !== 'RESOLVED').length || 0} cases need care
        </span>
      </PageHeading>
      <div className="toolbar">
        <div className="tabs">
          {['Open cases', 'Resolved', 'All cases'].map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : cases.length ? (
        <div className="order-grid">
          {cases.map((c) => (
            <button
              key={c.id}
              className="panel panel-body support-case"
              onClick={() => {
                setSelected(c.id);
                setResolution(false);
              }}
            >
              <div className="summary-row">
                <span className="store-avatar">
                  <MessageSquare size={20} />
                </span>
                <Badge value={c.status} />
              </div>
              <h3>{c.subject}</h3>
              <p className="muted">
                Order #{c.order.number} · {label(c.category)}
              </p>
              <div className="info-pair">
                <span>{c.messages.length} messages</span>
                <span>{date(c.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty title="A good moment for your guests">
          New order-specific cases appear here automatically.
        </Empty>
      )}
      {ticket && (
        <Modal title={ticket.subject} onClose={() => setSelected(null)}>
          <div className="summary-row">
            <Badge value={ticket.status} />
            <span>
              Order #{ticket.order.number} · {money(ticket.order.grandMinor)}
            </span>
          </div>
          <div className="conversation">
            {ticket.messages.map((m) => (
              <article
                key={m.id}
                className={`message-bubble ${m.author.role === 'CUSTOMER' ? 'customer' : 'team'}`}
              >
                <strong>
                  {m.author.name} · {label(m.author.role)}
                </strong>
                <p>{m.body}</p>
                <small>
                  {date(m.createdAt)} · {time(m.createdAt)}
                </small>
              </article>
            ))}
          </div>
          {!resolution && (
            <>
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const result = await run(
                    () =>
                      post(`support/${ticket.id}/messages`, {
                        message: formText(new FormData(form), 'reply'),
                      }),
                    'Reply sent to the guest inbox.',
                  );
                  if (result) form.reset();
                }}
              >
                <label>
                  Your reply
                  <textarea
                    name="reply"
                    minLength={1}
                    maxLength={3000}
                    required
                    disabled={ticket.status === 'RESOLVED'}
                  />
                </label>
                <button className="btn primary" disabled={busy || ticket.status === 'RESOLVED'}>
                  Send reply
                </button>
              </form>
              <button
                className="btn secondary wide section-gap"
                onClick={() => setResolution(true)}
              >
                <CheckCheck size={17} />
                Update or resolve case
              </button>
            </>
          )}
          {resolution && (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await run(
                  () =>
                    patch(`support/${ticket.id}`, {
                      status: formText(f, 'status'),
                      resolution: formText(f, 'resolution'),
                      refundMinor: Math.round(formNumber(f, 'refund') * 100),
                      refundReference: formText(f, 'reference') || undefined,
                    }),
                  'Resolution recorded and guest notified.',
                );
                if (result) {
                  setResolution(false);
                  setSelected(null);
                }
              }}
            >
              <label>
                Case status
                <select name="status" defaultValue="RESOLVED">
                  <option value="OPEN">Open / reopen</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </label>
              <label>
                Resolution notes
                <textarea name="resolution" required minLength={5} maxLength={1000} />
              </label>
              <div className="form-grid">
                <label>
                  External refund already issued (৳)
                  <input
                    name="refund"
                    type="number"
                    min={0}
                    max={ticket.order.grandMinor / 100}
                    step=".01"
                    defaultValue={ticket.refundMinor / 100}
                  />
                </label>
                <label>
                  External refund reference
                  <input
                    name="reference"
                    maxLength={150}
                    defaultValue={ticket.refundReference || ''}
                  />
                </label>
              </div>
              <p className="note-box">
                This records an external refund; it does not issue or transfer money. Use the
                verified card refund action on the order for configured Stripe payments.
              </p>
              <button className="btn primary" disabled={busy}>
                Save resolution
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
