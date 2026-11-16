import React from 'react';

type CustomerHomeHeroProps = {
  firstName: string;
};

export function CustomerHomeHero({ firstName }: CustomerHomeHeroProps) {
  const greeting = firstName ? `Welcome back, ${firstName}!` : 'Welcome back!';
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#071E3A] via-brand-800 to-[#0A254D] text-white p-7 sm:p-8 min-h-[140px] flex items-center justify-between shadow-sm">
      {/* Background drum image fading on the right with concentric circular rings */}
      <div className="pointer-events-none absolute inset-y-0 end-0 w-[55%] overflow-hidden hidden sm:block" aria-hidden>
        <img
          src="/login-cables.jpg"
          alt=""
          className="h-full w-full object-cover object-[65%_45%] opacity-25 [mask-image:linear-gradient(to_right,transparent_0%,black_40%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_40%,black_100%)]"
        />
        {/* Concentric rings at top-right, outer ring rotates slowly */}
        <div className="absolute -top-10 -end-10 h-64 w-64 rounded-full border border-white/10 pointer-events-none">
          <div className="absolute inset-4 rounded-full border border-white/15 pointer-events-none motion-safe:animate-[spin_60s_linear_infinite]" />
          <div className="absolute inset-10 rounded-full border border-white/10 pointer-events-none" />
        </div>
      </div>

      {/* Hero Text */}
      <div className="relative z-10 max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/70 block mb-1">
          Home
        </span>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
          {greeting}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-white/80 leading-relaxed font-normal">
          Manage your inquiries, quotations and orders.
        </p>
      </div>
    </section>
  );
}
