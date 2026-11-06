'use client';
import { useState } from 'react';
import { CalendarDays, ClipboardClock, Copy, Mail, Plus, Users } from 'lucide-react';
import { useApp } from '@/components/provider';
import { Badge, Empty, ErrorState, Loading, Modal, PageHeading } from '@/components/ui';
import { useAction, useResource } from '@/lib/hooks';
import { date, label, money, patch, post, time } from '@/lib/api';
import { formNumber, formText, toIso, type TeamPlan } from '@/lib/advanced';
export default function Workforce() {
  const { user, restaurantId, notify } = useApp();
  const { data, error, loading } = useResource<TeamPlan>(
    user ? `enterprise/${restaurantId}/team` : null,
  );
  const { run, busy } = useAction();
  const [tab, setTab] = useState('Schedule'),
    [modal, setModal] = useState<'invite' | 'shift' | null>(null),
    [inviteUrl, setInviteUrl] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE & LABOR PLANNING"
        title="Good service begins with a supported team."
        description="Plan shifts, manage leave and invite people with the access they actually need."
      >
        <button className="btn secondary" onClick={() => setModal('invite')}>
          <Mail size={17} />
          Invite teammate
        </button>
        <button
          className="btn primary"
          disabled={!data?.members.length}
          onClick={() => setModal('shift')}
        >
          <Plus size={17} />
          Plan shift
        </button>
      </PageHeading>
      <div className="toolbar">
        <div className="tabs">
          {['Schedule', 'Team & wages', 'Invitations', 'Leave requests'].map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <span className="date-chip">
          <Users size={17} />
          {data?.members.length || 0} team members
        </span>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : tab === 'Schedule' ? (
        <div className="order-grid">
          {data?.schedule.length ? (
            data.schedule.map((s) => (
              <article className="panel panel-body" key={s.id}>
                <div className="summary-row">
                  <h3>{s.user.name}</h3>
                  <Badge value={s.status} />
                </div>
                <p className="muted">
                  {label(s.role)} · {date(s.startsAt)}
                </p>
                <div className="shift-window">
                  <ClockLabel value={time(s.startsAt)} />
                  <span>to</span>
                  <ClockLabel value={time(s.endsAt)} />
                </div>
                <div className="info-pair">
                  <span>Planned time</span>
                  <strong>
                    {(
                      (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) /
                      3600000
                    ).toFixed(1)}{' '}
                    hours
                  </strong>
                </div>
                <div className="info-pair">
                  <span>Hourly rate snapshot</span>
                  <strong>{money(s.hourlyRateMinor)}</strong>
                </div>
                {s.notes && <p className="form-hint section-gap">{s.notes}</p>}
                {s.status === 'PLANNED' && (
                  <button
                    className="btn secondary section-gap"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => patch(`enterprise/shifts/${s.id}/cancel`, {}),
                        'Planned shift cancelled.',
                      )
                    }
                  >
                    Cancel shift
                  </button>
                )}
              </article>
            ))
          ) : (
            <Empty title="A little planning goes a long way">
              Create a shift. Overlapping assignments across branches are blocked.
            </Empty>
          )}
        </div>
      ) : tab === 'Team & wages' ? (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Teammate</th>
                <th>Role</th>
                <th>Hourly rate</th>
                <th>Update rate</th>
              </tr>
            </thead>
            <tbody>
              {data?.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.user.name}</strong>
                    <small className="cell-meta">{m.user.email}</small>
                  </td>
                  <td>
                    <Badge value={m.role} />
                  </td>
                  <td>{money(m.hourlyRateMinor)}</td>
                  <td>
                    <form
                      className="inline-fields"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await run(
                          () =>
                            patch(`enterprise/members/${m.id}`, {
                              hourlyRateMinor: Math.round(formNumber(f, 'rate') * 100),
                            }),
                          'Hourly rate updated. New planned shifts capture this rate.',
                        );
                      }}
                    >
                      <input
                        name="rate"
                        aria-label={`Hourly rate for ${m.user.name}`}
                        type="number"
                        min={0}
                        max={1000000}
                        step=".01"
                        defaultValue={m.hourlyRateMinor / 100}
                        style={{ maxWidth: 135 }}
                        required
                      />
                      <button className="btn secondary small" disabled={busy}>
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="form-hint panel-body">
            Only owners may change rates. Planned shifts retain the rate captured when they were
            created. This is planning data, not a payroll payment.
          </p>
        </section>
      ) : tab === 'Invitations' ? (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invitation email</th>
                <th>Access</th>
                <th>Expires</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {data?.invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>
                    <Badge value={i.role} />
                  </td>
                  <td>{date(i.expiresAt)}</td>
                  <td>
                    <button
                      className="text-link danger-text"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => patch(`enterprise/invites/${i.id}/revoke`, {}),
                          'Invitation revoked.',
                        )
                      }
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.invites.length && (
            <Empty title="Your team is up to date">
              New invitations expire after seven days and can be accepted only with the matching
              account email.
            </Empty>
          )}
        </section>
      ) : (
        <div className="order-grid">
          {data?.leave.length ? (
            data.leave.map((l) => (
              <article className="panel panel-body" key={l.id}>
                <div className="summary-row">
                  <h3>{l.user.name}</h3>
                  <Badge value={l.status} />
                </div>
                <p className="muted">
                  {date(l.startsAt)} – {date(l.endsAt)}
                </p>
                <p className="note-box section-gap">{l.reason}</p>
                {l.status === 'PENDING' && (
                  <div className="form-actions">
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => patch(`enterprise/leave/${l.id}`, { status: 'REJECTED' }),
                          'Leave request declined.',
                        )
                      }
                    >
                      Decline
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => patch(`enterprise/leave/${l.id}`, { status: 'APPROVED' }),
                          'Leave request approved.',
                        )
                      }
                    >
                      Approve
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <Empty title="No leave requests need attention" />
          )}
        </div>
      )}
      {modal === 'invite' && (
        <Modal title="Invite someone to your team" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run(
                () =>
                  post<{ inviteUrl: string }>(`enterprise/${restaurantId}/invites`, {
                    email: formText(f, 'email'),
                    role: formText(f, 'role'),
                  }),
                'Private invitation created.',
              );
              if (result) {
                setInviteUrl(result.inviteUrl);
                setModal(null);
              }
            }}
          >
            <label>
              Team member email
              <input name="email" type="email" required />
            </label>
            <label>
              Restaurant access
              <select name="role">
                {['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'].map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-hint">
              The invitation link is shown once for you to share securely. No email is sent
              automatically. Only an owner may invite a manager.
            </p>
            <button className="btn primary" disabled={busy}>
              Create invitation link
            </button>
          </form>
        </Modal>
      )}
      {modal === 'shift' && (
        <Modal title="Plan a clear service shift" onClose={() => setModal(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const membership = data?.members.find((m) => m.id === formText(f, 'member'));
              if (!membership) return;
              const result = await run(
                () =>
                  post(`enterprise/${restaurantId}/shifts`, {
                    userId: membership.user.id,
                    role: membership.role,
                    startsAt: toIso(formText(f, 'start')),
                    endsAt: toIso(formText(f, 'end')),
                    notes: formText(f, 'notes'),
                  }),
                'Shift planned.',
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Teammate and role
              <select name="member" required>
                {data?.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.name} · {label(m.role)}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Starts
                <input name="start" type="datetime-local" required />
              </label>
              <label>
                Ends
                <input name="end" type="datetime-local" required />
              </label>
            </div>
            <label>
              Service notes
              <textarea name="notes" maxLength={500} />
            </label>
            <p className="form-hint">
              Maximum 16 hours per shift. Concurrent or overlapping branch assignments are rejected.
            </p>
            <button className="btn primary" disabled={busy}>
              Plan shift
            </button>
          </form>
        </Modal>
      )}
      {inviteUrl && (
        <Modal title="A private invitation, ready to share" onClose={() => setInviteUrl('')}>
          <p className="muted">
            Send this link privately to the teammate. They must sign in using the invited email.
          </p>
          <input
            className="section-gap"
            value={inviteUrl}
            readOnly
            aria-label="Private invitation link"
            onFocus={(e) => e.target.select()}
          />
          <div className="form-actions">
            <button
              className="btn primary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => notify('Invitation copied.'))
                  .catch(() => notify('Select the link and copy it manually.', true))
              }
            >
              <Copy size={17} />
              Copy link
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ClockLabel({ value }: { value: string }) {
  return (
    <strong>
      <ClipboardClock size={17} />
      {value}
    </strong>
  );
}
