'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ShieldCheck } from 'lucide-react';
import { CustomerShell } from '@/components/shell';
import { useApp } from '@/components/provider';
import { useAction } from '@/lib/hooks';
import { post } from '@/lib/api';
export default function Invite() {
  const { user, reloadUser, setRestaurantId, ready } = useApp();
  const [token, setToken] = useState('');
  const { run, busy } = useAction();
  const router = useRouter();
  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') || ''), []);
  return (
    <CustomerShell>
      <div className="invite-panel panel panel-body">
        <span className="feature-icon">
          <Building2 size={30} />
        </span>
        <h1>You’ve got a place on the team.</h1>
        <p className="muted">
          Accept your private invitation to join the restaurant workspace. Sign in using the email
          address that received it.
        </p>
        {!token ? (
          <p className="danger-text">This invitation link has no token.</p>
        ) : ready && !user ? (
          <Link
            className="btn primary"
            href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}
          >
            Sign in to accept
          </Link>
        ) : (
          <button
            className="btn primary"
            disabled={busy || !user}
            onClick={async () => {
              const result = await run(
                () =>
                  post<{ restaurantId: string; role: string }>('enterprise/invites/accept', {
                    token,
                  }),
                'Welcome to the team.',
              );
              if (result) {
                setRestaurantId(result.restaurantId);
                await reloadUser();
                router.push(
                  result.role === 'KITCHEN'
                    ? '/restaurant/kitchen'
                    : result.role === 'MANAGER'
                      ? '/restaurant'
                      : '/restaurant/tables',
                );
              }
            }}
          >
            <ShieldCheck size={18} />
            Accept invitation
          </button>
        )}
        <p className="form-hint">Invitations expire after seven days and can be used once.</p>
      </div>
    </CustomerShell>
  );
}
