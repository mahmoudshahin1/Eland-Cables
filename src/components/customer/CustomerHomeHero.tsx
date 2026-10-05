import React from 'react';
import { CustomerPageHero } from './CustomerPageHero';

type CustomerHomeHeroProps = {
  firstName: string;
};

export function CustomerHomeHero({ firstName }: CustomerHomeHeroProps) {
  const greeting = firstName ? `Welcome back, ${firstName}!` : 'Welcome back!';
  return (
    <CustomerPageHero
      title={greeting}
      subtitle="Manage your inquiries, quotations and orders."
    />
  );
}
