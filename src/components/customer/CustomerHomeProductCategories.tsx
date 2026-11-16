import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CUSTOMER_HOME_CATEGORY_TILES } from '../../app/customerPortalNav';
import { CUSTOMER_PRODUCTS_PATH, customerProductsPath } from '../../app/shellRoutes';

export function CustomerHomeProductCategories() {
  const navigate = useNavigate();
  const openCatalog = (category?: string) => {
    navigate(category ? customerProductsPath(category) : CUSTOMER_PRODUCTS_PATH);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between h-full min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-800">Product Categories</h2>
        <button
          type="button"
          onClick={() => openCatalog()}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
        >
          View All
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 flex-1">
        {CUSTOMER_HOME_CATEGORY_TILES.map((category) => (
          <div key={category.id} className="relative">
            {/* Static offset layer behind tile matching mockup */}
            <div
              className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 rounded-2xl bg-brand-100/70 -z-10"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => openCatalog(category.catalogCategory || category.id)}
              className="group relative block w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 shadow-sm border border-slate-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 hover:ring-2 hover:ring-brand-500/40 transition-all text-start"
            >
              {category.imageSrc && (
                <img
                  src={category.imageSrc}
                  alt=""
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}
              {/* Dark gradient scrim for >= 4.5:1 contrast (Flaw B0 #4) */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
                aria-hidden="true"
              />
              {/* Frosted glass label bar at bottom */}
              <div className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 px-2.5 py-1.5 text-center shadow-xs">
                <span className="block text-xs sm:text-[13px] font-semibold text-white tracking-wide truncate">
                  {category.label}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
