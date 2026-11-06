'use client';
import { useAction } from '@/lib/hooks';
import { patch } from '@/lib/api';
import type { Restaurant } from '@/lib/types';
const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export function OpeningHours({ restaurant: r }: { restaurant: Restaurant }) {
  const { run, busy } = useAction();
  return (
    <form
      key={r.id}
      className="panel panel-body section-gap"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const openingHours = Object.fromEntries(
          days.map((day) => [
            day,
            {
              open: Number(f.get(`${day}-open`)),
              close: Number(f.get(`${day}-close`)),
              closed: f.get(`${day}-closed`) === 'on',
            },
          ]),
        );
        await run(
          () => patch(`restaurants/${r.id}`, { openingHours }),
          'Weekly opening hours saved.',
        );
      }}
    >
      <h2>Weekly opening hours</h2>
      <p className="form-hint">
        Local restaurant hours. Online checkout validates the requested time. Use 0 to 24 for all
        day.
      </p>
      <div className="table-scroll section-gap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Opens (hour)</th>
              <th>Closes (hour)</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const h = r.openingHours?.[day];
              return (
                <tr key={day}>
                  <td>{day}</td>
                  <td>
                    <input
                      aria-label={`${day} opens`}
                      name={`${day}-open`}
                      type="number"
                      min="0"
                      max="23"
                      required
                      defaultValue={h?.open ?? 0}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${day} closes`}
                      name={`${day}-close`}
                      type="number"
                      min="1"
                      max="24"
                      required
                      defaultValue={h?.close ?? 24}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${day} closed`}
                      name={`${day}-closed`}
                      type="checkbox"
                      defaultChecked={h?.closed ?? false}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button disabled={busy} className="btn primary section-gap">
        Save opening hours
      </button>
    </form>
  );
}
