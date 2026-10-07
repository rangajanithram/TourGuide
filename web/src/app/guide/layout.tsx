import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TripWeave — Interactive User Manual & Product Showcase',
  description:
    'An interactive product showcase, architectural user manual, and business proposal for TripWeave: the algorithmic travel planning engine and group expense settlement platform.',
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
