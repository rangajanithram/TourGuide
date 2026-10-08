'use client';

import { useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ExperienceMetrics from './ExperienceMetrics';
import { ArrowRight, Compass, Eye, EyeOff, Leaf, ShieldCheck } from 'lucide-react';
import './account.css';

const TravelWorld = dynamic(() => import('./TravelWorld'), { ssr: false });

export default function AccountWelcome({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState({name: '', email: '', password: ''});
  const progress = useRef(initialMode === 'signup' ? .75 : .3);
  const signup = mode === 'signup';

  function changeMode() {
    setMode(signup ? 'login' : 'signup');
    setMessage('');
    setShowPassword(false);
    progress.current = signup ? .3 : .75;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    setMessage('This is an account-screen preview. No credentials were sent or saved. Continue as a guest to explore TripWeave.');
  }

  return <main className="account-page">
    <ExperienceMetrics /><header className="account-header"><Link href="/guide"><Compass size={25} />TripWeave<span>THE FOREST LINE</span></Link><Link href="/guide">Explore the guide <ArrowRight size={16} /></Link></header>
    <div className={`account-shell ${signup ? 'account-signup' : ''}`}>
      <section className="account-story" aria-label="Welcome to TripWeave">
        <span className="account-eyebrow"><Leaf size={14} /> GOOD JOURNEYS START WITH CURIOSITY</span>
        <h1>{signup ? <>A new chapter.<br /><em>Your kind of adventure.</em></> : <>Somewhere wonderful<br /><em>is waiting.</em></>}</h1>
        <p>{signup ? 'Dream up the places. Bring your favorite people. Let’s make room for the stories you’ll tell.' : 'A quiet trail. A city you’ve never met. A trip that feels like you. Start putting the pieces together.'}</p>
        <div className="account-world"><TravelWorld motionSpeed={1.4} progress={progress} night={false} paused={false} rotation={signup ? .5 : 0} /></div>
        <div className="account-story-footer"><span>01 — DREAM IT</span><i /><span>02 — PLAN IT</span><i /><span>03 — LIVE IT</span></div>
      </section>
      <section className="account-form-panel" aria-labelledby="account-heading">
        <span className="account-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h2 id="account-heading">{signup ? 'Come along.' : 'Welcome back.'}</h2>
        <p>{signup ? 'A little about you, a world of possibilities.' : 'Pick up where your curiosity left off.'}</p>
        <div className="account-preview"><ShieldCheck size={17} /><span>Class presentation preview. Accounts are not connected yet. Use sample details only.</span></div>
        <form onSubmit={submit}>
          {signup && <label key="name">Your name<input value={fields.name} onChange={event => setFields({...fields, name:event.target.value})} name="name" placeholder="Alex Traveler" autoComplete="off" required maxLength={80} /></label>}
          <label key="email">Email address<input value={fields.email} onChange={event => setFields({...fields, email:event.target.value})} type="email" name="email" placeholder="alex@example.com" autoComplete="off" required maxLength={254} /></label>
          <label key="password">Password<span className="password-field"><input value={fields.password} onChange={event => setFields({...fields, password:event.target.value})} name="password" type={showPassword ? 'text' : 'password'} placeholder="Use a sample password" autoComplete="off" required minLength={8} maxLength={128} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          <button className="account-primary" type="submit">{signup ? 'Preview sign up' : 'Preview login'}<ArrowRight size={17} /></button>
        </form>
        {message && <p className="account-message" role="status">{message}</p>}
        <p className="account-switch">{signup ? 'Already have an account?' : 'Don’t have an account?'} <button type="button" onClick={changeMode}>{signup ? 'Log in' : 'Sign up'} <ArrowRight size={13} /></button></p>
        <div className="account-divider"><span />OR TAKE A LOOK AROUND<span /></div>
        <Link className="account-guest" href="/guide">Continue as a guest <ArrowRight size={16} /></Link>
        <p className="account-privacy">No account needed to explore the guide or open the planner.</p>
      </section>
    </div>
    <footer className="account-footer"><span>LESS PLANNING FRICTION. MORE POSSIBILITY.</span><Link href="/planner">Go straight to the planner ↗</Link></footer>
  </main>;
}
