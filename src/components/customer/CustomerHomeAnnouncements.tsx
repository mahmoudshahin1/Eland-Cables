import React from 'react';
import { FileText, Megaphone } from 'lucide-react';
import type { SystemNotification } from '../../types';

type CustomerHomeAnnouncementsProps = {
  notifications?: SystemNotification[];
  onViewAll?: () => void;
};

export function CustomerHomeAnnouncements({ notifications = [], onViewAll }: CustomerHomeAnnouncementsProps) {
  const items = notifications.slice(0, 5);

  return (
    <section className="customer-home-card h-full min-w-0">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-800">Announcements</h2>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="text-xs font-medium text-[#2563EB] hover:underline">
            View All
          </button>
        ) : (
          <span className="text-xs font-medium text-[#2563EB]">View All</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-5 pb-5 pt-2 flex items-start gap-3 text-slate-500">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-400 shrink-0">
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">No announcements right now.</p>
            <p className="text-xs text-slate-400 mt-0.5">Updates from Energya will appear here.</p>
          </div>
        </div>
      ) : (
        <ul className="px-3 pb-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-2 py-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500 shrink-0">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{item.message}</p>
              </div>
              {item.timestamp ? (
                <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 pt-0.5">{item.timestamp}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
