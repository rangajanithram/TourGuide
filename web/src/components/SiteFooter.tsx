import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-inner">
      <div><Link href="/guide" className="site-footer-brand"><Compass size={23} aria-hidden="true" />TripWeave</Link><p>A little planning. A world of possibility.</p></div>
      <nav aria-label="Footer navigation"><Link href="/guide#user-manual">How to use TripWeave</Link><Link href="/planner">Plan a trip</Link></nav>
    </div>
  </footer>;
}
