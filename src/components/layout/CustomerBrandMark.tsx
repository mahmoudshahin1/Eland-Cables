import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  customerCompanyDescriptor,
  customerCompanyDisplayName,
  resolveCustomerBrandLogo,
} from '../../app/customerPortalNav';

type CustomerBrandMarkProps = {
  className?: string;
  logoClassName?: string;
  showName?: boolean;
  /** Compact header on narrow screens. */
  compact?: boolean;
  onDark?: boolean;
};

function GenericCompanyPlaceholder({
  className,
  onDark,
}: {
  className: string;
  onDark: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg aspect-square shrink-0 ${
        onDark ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
      } ${className}`}
      aria-hidden
    >
      <Building2 className="h-[58%] w-[58%]" strokeWidth={1.75} />
    </span>
  );
}

/**
 * Authenticated customer identity from Customer Master.
 * Uploaded logo is shown unmodified. Missing logo uses a generic company placeholder —
 * never the Energya lockup.
 */
export const CustomerBrandMark: React.FC<CustomerBrandMarkProps> = ({
  className = '',
  logoClassName = 'h-8',
  showName = true,
  compact = false,
  onDark = false,
}) => {
  const { currentUser } = useAuth();
  const companyName = customerCompanyDisplayName(currentUser);
  const descriptor = customerCompanyDescriptor(currentUser);
  const brand = resolveCustomerBrandLogo(currentUser);
  const textClass = onDark ? 'text-white' : 'text-brand-800';
  const subClass = onDark ? 'text-white/70' : 'text-slate-500';

  return (
    <span className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      {brand.kind === 'uploaded' ? (
        <img
          src={brand.url}
          alt={companyName || 'Customer'}
          draggable={false}
          className={`w-auto object-contain shrink-0 ${logoClassName}`}
        />
      ) : (
        <GenericCompanyPlaceholder className={logoClassName} onDark={onDark} />
      )}
      {showName && companyName ? (
        <span className={`min-w-0 ${compact ? 'max-w-[8rem]' : 'max-w-[10rem] sm:max-w-[18rem]'}`}>
          <span className={`block font-display text-[14px] sm:text-[16px] font-bold leading-tight truncate ${textClass}`}>
            {companyName}
          </span>
          {descriptor ? (
            <span className={`hidden sm:block text-[11px] font-medium leading-tight truncate ${subClass}`}>
              {descriptor}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
};
