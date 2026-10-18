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
    <section className="customer-home-card h-full min-w-0">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-slate-800">Product Categories</h2>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
            3D Studio
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/customer/3d-cable')}
            className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 hover:underline flex items-center gap-1"
          >
            Open 3D Studio
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => openCatalog()}
            className="text-xs font-medium text-[#2563EB] hover:underline"
          >
            View All
          </button>
        </div>
      </div>
      <div className="px-3 pb-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {CUSTOMER_HOME_CATEGORY_TILES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => openCatalog(category.catalogCategory || category.id)}
            className="flex flex-col items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50 min-w-0"
          >
            <span className="block w-full aspect-square max-h-[5.5rem] overflow-hidden rounded-lg bg-white">
              <img
                src={category.imageSrc}
                alt=""
                className="h-full w-full object-contain object-center"
              />
            </span>
            <span className="text-[11px] font-medium text-slate-600 text-center leading-snug">{category.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
