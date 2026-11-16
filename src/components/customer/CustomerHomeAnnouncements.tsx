import React from 'react';
import { Megaphone } from 'lucide-react';
import type { SystemNotification } from '../../types';

type CustomerHomeAnnouncementsProps = {
  notifications?: SystemNotification[];
  onViewAll?: () => void;
};

function formatAnnouncementDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function CustomerHomeAnnouncements({ notifications = [], onViewAll }: CustomerHomeAnnouncementsProps) {
  const items = notifications.slice(0, 5);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between h-full min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-800">Announcements</h2>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
          >
            View All
          </button>
        ) : (
          <span className="text-xs font-semibold text-brand-600">View All</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center gap-3 py-6 text-slate-500">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-400 shrink-0">
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">No announcements right now.</p>
            <p className="text-xs text-slate-400 mt-0.5">Updates from Energya will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="relative border-s-2 border-slate-100 ms-2.5 ps-5 py-1 space-y-4 flex-1">
          {items.map((item) => (
            <div key={item.id} className="relative">
              {/* Hollow circle marker matching Image 2 */}
              <span
                className="absolute -start-[27px] top-1 h-3 w-3 rounded-full border-2 border-brand-500 bg-white ring-4 ring-white"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
                {item.timestamp ? (
                  <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 pt-0.5">
                    {formatAnnouncementDate(item.timestamp)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                {item.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
