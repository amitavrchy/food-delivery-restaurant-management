'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, MailOpen } from 'lucide-react';
import { useApp } from './provider';
import { Modal, Empty, Loading, ErrorState } from './ui';
import { useResource, useAction } from '@/lib/hooks';
import { date, time, patch, post } from '@/lib/api';
import type { NotificationFeed } from '@/lib/advanced';
export function NotificationBell() {
  const { user } = useApp();
  const { data, error, loading } = useResource<NotificationFeed>(user ? 'notifications' : null);
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <button
        className="icon-btn notification-btn"
        aria-label={`Notifications, ${data?.unread || 0} unread`}
        onClick={() => setOpen(true)}
      >
        <Bell size={20} />
        {!!data?.unread && (
          <b className="notification-count">{data.unread > 99 ? '99+' : data.unread}</b>
        )}
      </button>
      {open && (
        <Modal title="Your notification inbox" onClose={() => setOpen(false)}>
          <div className="summary-row">
            <span className="muted">{data?.unread || 0} unread updates</span>
            <button
              className="text-link"
              disabled={busy || !data?.unread}
              onClick={() =>
                void run(() => post('notifications/read-all'), 'Inbox marked as read.')
              }
            >
              <CheckCheck size={17} />
              Mark all read
            </button>
          </div>
          {loading && !data ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error} />
          ) : data?.items.length ? (
            <div className="notification-list">
              {data.items.map((n) => (
                <Link
                  href={n.href}
                  key={n.id}
                  className={`notification-item ${!n.readAt ? 'unread' : ''}`}
                  onClick={() => {
                    if (!n.readAt) void run(() => patch(`notifications/${n.id}/read`, {}));
                    setOpen(false);
                  }}
                >
                  <span className="store-avatar">
                    <MailOpen size={19} />
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <small>
                      {date(n.createdAt)} · {time(n.createdAt)}
                    </small>
                  </div>
                  {!n.readAt && <i className="unread-dot" />}
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="You’re all caught up">
              Orders, rewards, bookings and support updates will appear here.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
