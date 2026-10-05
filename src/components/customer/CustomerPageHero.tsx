import React from 'react';
import { Link } from 'react-router-dom';

/** Outdoor drums + factory — matches the customer chrome screenshot. */
export const CUSTOMER_PAGE_HERO_IMAGE = '/login-cables.jpg';

export const CUSTOMER_PAGE_HERO_SLOGAN_LINES = [
  'Reliable cable',
  'solutions for a',
  'brighter tomorrow',
] as const;

export type CustomerPageHeroCrumb = {
  label: string;
  to?: string;
};

export type CustomerPageHeroProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: CustomerPageHeroCrumb[];
  titleAccessory?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional photo override. Default is the shared drums strip. */
  photoSrc?: string;
};

function HeroSlogan({ className }: { className?: string }) {
  return (
    <p
      className={`text-right font-extrabold uppercase tracking-[0.16em] leading-[1.45] text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)] ${className || ''}`}
    >
      {CUSTOMER_PAGE_HERO_SLOGAN_LINES[0]}
      <br />
      {CUSTOMER_PAGE_HERO_SLOGAN_LINES[1]}
      <br />
      {CUSTOMER_PAGE_HERO_SLOGAN_LINES[2]}
    </p>
  );
}

/**
 * Shared customer-portal page strip. Title / subtitle / breadcrumb vary;
 * drums photo + slogan stay identical on every customer page.
 */
export function CustomerPageHero({
  title,
  subtitle,
  breadcrumbs,
  titleAccessory,
  actions,
  photoSrc,
}: CustomerPageHeroProps) {
  const hasCrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0);
  const photo = photoSrc || CUSTOMER_PAGE_HERO_IMAGE;

  return (
    <div className="space-y-3">
      <section className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-[var(--shadow-card)]">
        <div
          className="pointer-events-none absolute inset-y-0 end-0 hidden md:block w-[min(48%,32rem)]"
          aria-hidden
        >
          <img
            src={photo}
            alt=""
            className={`h-full w-full ${
              photoSrc
                ? 'object-contain object-[78%_50%] scale-[1.12] origin-right'
                : 'object-cover object-[58%_46%] scale-[1.06] origin-right'
            } [mask-image:linear-gradient(to_right,transparent_0%,black_30%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_30%,black_100%)]`}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-black/20 via-transparent to-white" />
          <HeroSlogan className="absolute end-5 lg:end-6 top-1/2 -translate-y-1/2 max-w-[9.75rem] text-[11px] lg:text-[12px]" />
        </div>

        <div className="relative z-[1] px-5 sm:px-6 lg:px-7 py-5 sm:py-[1.35rem] min-h-[7.25rem] sm:min-h-[8.25rem] flex flex-col justify-center max-w-xl md:max-w-[54%]">
          {hasCrumbs ? (
            <nav className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-400" aria-label="Breadcrumb">
              {breadcrumbs!.map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? (
                    <span aria-hidden className="text-slate-300">
                      ›
                    </span>
                  ) : null}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-brand-500">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-500">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          ) : null}
          <div className={`${hasCrumbs ? 'mt-1.5' : ''} flex flex-wrap items-center gap-2.5 min-w-0`}>
            <h1 className="font-display text-[1.75rem] sm:text-[2rem] font-bold tracking-tight text-brand-800 leading-tight">
              {title}
            </h1>
            {titleAccessory}
          </div>
          {subtitle ? (
            <p className="mt-1.5 text-[14px] text-slate-500 max-w-xl leading-relaxed">{subtitle}</p>
          ) : null}
        </div>

        <div className="md:hidden relative h-[4.25rem] overflow-hidden" aria-hidden>
          <img
            src={photo}
            alt=""
            className={`h-full w-full ${photoSrc ? 'object-contain object-[70%_50%]' : 'object-cover object-[58%_46%]'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/35 to-black/15" />
          <HeroSlogan className="absolute end-3 top-1/2 -translate-y-1/2 max-w-[7.5rem] text-[9px] tracking-[0.14em]" />
        </div>
      </section>
      {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
