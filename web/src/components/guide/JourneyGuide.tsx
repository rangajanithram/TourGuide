'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ExperienceMetrics from './ExperienceMetrics';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowRight, Check, Compass, MapPin, Minus, Moon, Pause, Play, Plus, RotateCcw, Sun, Ticket, TrainFront, Users, Wallet, Route, Coffee, Sparkles, CloudFog, CloudRain } from 'lucide-react';

const TravelWorld = dynamic(() => import('./NatureRailway'), { ssr: false, loading: () => <div className="world-loading">Assembling your little world…</div> });
const stations = [
  { city: 'Hyderabad', id: 'departure', label: 'The big idea', coordinates: '17.3850° N / 78.4867° E' },
  { city: 'Jaipur', id: 'preferences', label: 'Your kind of trip', coordinates: '26.9124° N / 75.7873° E' },
  { city: 'Delhi', id: 'possibilities', label: 'The possibilities', coordinates: '28.6139° N / 77.2090° E' },
  { city: 'Bengaluru', id: 'detours', label: 'Happy detours', coordinates: '12.9716° N / 77.5946° E' },
  { city: 'Mumbai', id: 'together', label: 'Better together', coordinates: '19.0760° N / 72.8777° E' },
];
const variants = {
  budget: { name: 'The easy-on-the-wallet one.', lodging: 2400, transit: 650, visits: 400, dining: 1200 },
  balanced: { name: 'A little of everything.', lodging: 3600, transit: 1100, visits: 400, dining: 1800 },
  comfort: { name: 'More comfort. Less juggling.', lodging: 5600, transit: 1800, visits: 400, dining: 2400 },
};
const manuals = [
  { title: 'Build a trip', icon: Compass, steps: [ ['Set the scene', 'Choose a supported destination, your dates, group size, and total budget. Include the right origin so travel assumptions make sense.'], ['Tell us your style', 'Pick your pace, interests, and local transport. Pin the places that matter most; too many must-sees can make a trip infeasible.'], ['Generate & compare', 'Open the planner and generate your options. Read any feasibility messages before choosing a plan.'] ] },
  { title: 'Read the plan', icon: Route, steps: [ ['Follow the timeline', 'Read each day in order, including travel time, opening windows, and the time left for visits.'], ['Look at the whole budget', 'Review lodging, local travel, activities, dining estimates, and any intercity travel included in your request.'], ['Check the assumptions', 'Use the map for orientation. Read data labels and warnings, and independently confirm current opening hours and prices before travel.'] ] },
  { title: 'Change plans', icon: Coffee, steps: [ ['Start with one change', 'Use the available itinerary controls to adjust an activity, change your preferences, or request a new plan.'], ['Review the consequences', 'A different stop can affect travel time, budget, and other visits. Check the resulting itinerary and feasibility messages.'], ['Keep a useful copy', 'Use the planner’s sharing or calendar export controls. Confirm the shared view contains the version you intended.'] ] },
  { title: 'Travel together', icon: Users, steps: [ ['Share the itinerary', 'Send your group a planner link so everyone can see the trip. A link is not a booking confirmation.'], ['Record real spending', 'Open the expense tracker, set up the members, and record who paid and who shared an expense.'], ['Review & settle', 'Check balances before paying. Browser-local records are not a synchronized group ledger, and a payment link does not confirm payment.'] ] },
];
const faqs = [
  ['Can I book my trip here?', 'TripWeave is a planning prototype. It helps you understand an itinerary and its estimated cost; it does not confirm hotel, attraction, or transport bookings.'],
  ['Is the train showing a real railway route?', 'No. This little world is an illustrated tour of the product. Its landmarks and railway are stylized, and their positions are not a geographic or transport recommendation.'],
  ['Are these prices live?', 'The interactive examples on this page use fixed demonstration values. Generated plans have their own estimates and data labels. Confirm current fares, availability, hours, and prices with providers before travel.'],
  ['What if all my must-see places do not fit?', 'A useful planner should explain that conflict. Try fewer pins, more time, a different pace, or a larger budget. A feasible plan is more helpful than an overcrowded list of attractions.'],
  ['Does sharing also sync everyone’s expenses?', 'Do not assume that it does. The current expense tracker uses browser-local storage. An itinerary link does not automatically create a shared, real-time expense database.'],
  ['How can I demonstrate this in class?', 'Start with this journey, try the interactive examples, and open a sample in the planner. Keep the backend running for generation. Explain which features work today, which values are estimates, and which ideas are future work.'],
];
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function LandmarkStamp({ index }: { index: number }) {
  return <svg viewBox="0 0 180 110" fill="none" aria-hidden="true">
    <circle cx="128" cy="30" r="22" fill="currentColor" opacity=".12" />
    <path d="M15 97H165M25 102H155" stroke="currentColor" strokeWidth="2" />
    {index === 0 ? <g stroke="currentColor" strokeWidth="2.5"><path d="M49 95V39H131V95M40 95V22H55V95M125 95V22H140V95M37 22L47 9L58 22M122 22L132 9L143 22M73 95V67Q90 43 107 67V95M60 39V31H120V39M77 31Q90 8 103 31" /><path d="M61 51H69M111 51H119M61 70H69M111 70H119" /></g>
    : index === 1 ? <g stroke="currentColor" strokeWidth="2.5"><path d="M37 95V47H49V34H64V22H116V34H131V47H143V95M33 78H147M37 60H143" />{[51,70,90,110,130].map(x => <path key={x} d={`M${x-4} 92V85Q${x} 79 ${x+4} 85V92M${x-4} 72V65Q${x} 59 ${x+4} 65V72`} />)}<path d="M70 50V42Q76 31 82 42V50M98 50V42Q104 31 110 42V50" /></g>
    : index === 2 ? <g stroke="currentColor" strokeWidth="3"><path d="M49 95V33H131V95M41 33V23H139V33M59 23V14H121V23" /><path d="M70 95V64Q90 39 110 64V95M56 43H124M58 83H65M115 83H123" /></g>
    : index === 3 ? <g stroke="currentColor" strokeWidth="2.5"><path d="M32 95V53L90 16L148 53V95M32 53H148M48 95V53M68 95V53M90 95V16M112 95V53M132 95V53M32 75H148M61 53L90 16L119 53" /><path d="M23 95V68M17 74Q10 53 25 53Q42 53 31 74M155 95V64M148 72Q139 49 157 49Q174 52 163 73" /></g>
    : <g stroke="currentColor" strokeWidth="2.5"><path d="M38 95V33H142V95M32 33H148M50 33V17H63V33M117 33V17H130V33M47 17L56 8L66 17M114 17L123 8L133 17M70 95V64Q90 38 110 64V95M76 33Q90 9 104 33M43 82H63M117 82H138M44 49H62M118 49H137" /></g>}
  </svg>;
}

export default function JourneyGuide() {
  const router = useRouter();
  const journey = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const progressBar = useRef<HTMLDivElement>(null);
  const [station, setStation] = useState(0);
  const [night, setNight] = useState(false);
  const [weather, setWeather] = useState('clear');
  const [journeyVisible, setJourneyVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [variant, setVariant] = useState<keyof typeof variants>('balanced');
  const [pace, setPace] = useState('balanced');
  const [rest, setRest] = useState(false);
  const [people, setPeople] = useState(3);
  const [manualTab, setManualTab] = useState(0);
  const [destination, setDestination] = useState('Hyderabad');

  useEffect(() => {
    let frame = 0;
    const sceneObserver = new IntersectionObserver(([entry]) => setJourneyVisible(entry.isIntersecting));
    if (journey.current) sceneObserver.observe(journey.current);
    const update = () => {
      frame = 0;
      const chapters = journey.current?.querySelectorAll<HTMLElement>('[data-chapter]');
      if (!chapters || chapters.length !== 5) return;
      const offset = window.innerWidth < 900 ? 65 : 83;
      const tops = Array.from(chapters, item => item.getBoundingClientRect().top - offset);
      let value = 0;
      for (let i = 0; i < 4; i++) {
        if (tops[i] <= 0) value = (i + Math.min(1, Math.max(0, -tops[i] / Math.max(1, tops[i + 1] - tops[i])))) / 4;
      }
      if (tops[4] <= 0) value = 1;
      progress.current = value;
      setStation(Math.min(4, Math.round(value * 4)));
      if (progressBar.current) progressBar.current.style.transform = `scaleX(${value})`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => { sceneObserver.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);

  function openExample(city: string) {
    const start = new Date(); start.setDate(start.getDate() + 7);
    const end = new Date(start); end.setDate(end.getDate() + 2);
    const date = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const params = new URLSearchParams({ dest: city.toLowerCase(), start: date(start), end: date(end), people: String(people), budget: '15000', pace, mode: 'cab', variant, origin_type: 'center' });
    router.push(`/planner?${params.toString()}`);
  }
  const option = variants[variant];
  const subtotal = option.lodging + option.transit + option.visits + option.dining;
  const shares = Array.from({ length: people }, (_, i) => (Math.floor(240000 / people) + (i < 240000 % people ? 1 : 0)) / 100);

  return <main className={`journey-guide ${night ? 'is-night' : ''}`}>
    <ExperienceMetrics /><a className="guide-skip" href="#user-manual">Skip to the user guide</a>
    <header className="journey-header">
      <Link className="journey-brand" href="/guide"><span><Compass size={23} strokeWidth={1.6} /></span>TripWeave<i /></Link>
      <nav aria-label="Guide navigation"><a href="#departure">The journey</a><a href="#user-manual">Field guide</a><a href="#questions">Good to know</a></nav>
      <Link className="guide-account-link" href="/login">Log in / Sign up</Link><Link className="nav-planner" href="/planner">Open planner <ArrowRight size={16} /></Link>
    </header>

    <div className="journey-layout" ref={journey}>
      <div className="journey-stories">
        <section id="departure" className="story-chapter intro-chapter" data-chapter><div className="cloud-note">
          <div className="eyebrow"><span /> YOUR NEXT GREAT STORY STARTS HERE</div>
          <h1>A little planning.<br />A whole lot of <em>possibility.</em></h1>
          <p className="chapter-description">Less time figuring it all out. More time being there. Meet the travel planner that brings your places, people, time, and budget into one journey.</p>
          <a className="journey-button" href="#preferences">Let’s take the scenic route <ArrowDown size={18} /></a>
          <div className="hero-footnote"><span className="ticket-mini"><Ticket size={19} /></span><span>One winding railway. Five discoveries.<br /><strong>A better way to meet TripWeave.</strong></span></div>
          <div className="scroll-invitation"><span className="scroll-line" /> SCROLL TO FOLLOW THE FOREST LINE</div>
        </div></section>

        <section id="preferences" className="story-chapter" data-chapter><div className="cloud-note">
          <div className="chapter-number">01 <span>THE DEPARTURE BOARD</span></div>
          <p className="city-kicker"><MapPin size={14} /> A little inspiration from Jaipur</p>
          <h2>Your trip.<br /><em>Your kind of day.</em></h2>
          <p className="chapter-description">Slow mornings or one more museum? Start with your dates, budget, interests, and the people coming along. Your preferences give the planner its starting point.</p>
          <div className="interactive-card pace-card"><div className="card-eyebrow">TRY IT · PICK YOUR PACE</div>
            <div className="pace-options">{[['relaxed', 'Easy does it', '02'], ['balanced', 'A bit of both', '03'], ['intensive', 'See it all', '04']].map(([key, label, number]) => <button key={key} aria-pressed={pace === key} className={pace === key ? 'selected' : ''} onClick={() => setPace(key)}><span>{number}</span>{label}{pace === key && <Check size={14} />}</button>)}</div>
            <div className="pace-result" key={pace}><Coffee size={21} /><p>Room for up to <strong>{pace === 'relaxed' ? 2 : pace === 'balanced' ? 3 : 4} activities a day.</strong><small>Actual stops depend on travel time, hours, and feasibility.</small></p></div>
          </div>
          <p className="chapter-aside">A good itinerary should feel like you. With enough breathing room to enjoy it.</p>
        </div></section>

        <section id="possibilities" className="story-chapter" data-chapter><div className="cloud-note">
          <div className="chapter-number">02 <span>MORE THAN ONE WAY THERE</span></div>
          <p className="city-kicker"><MapPin size={14} /> Finding our rhythm in Delhi</p>
          <h2>See the options.<br /><em>Feel the difference.</em></h2>
          <p className="chapter-description">A smaller bill, a comfortable middle ground, or a little extra ease. Compare plans and understand the tradeoffs before you choose.</p>
          <div className="interactive-card budget-card"><div className="card-eyebrow">TRY IT · COMPARE SAMPLE ESTIMATES</div>
            <div className="segmented-control" aria-label="Sample plan style">{(Object.keys(variants) as (keyof typeof variants)[]).map(key => <button key={key} aria-pressed={variant === key} className={variant === key ? 'selected' : ''} onClick={() => setVariant(key)}>{key}</button>)}</div>
            <div className="sample-price" key={variant}><span>{option.name}</span><strong>{money(subtotal)}</strong><small>Example subtotal · two travelers / two days</small></div>
            <div className="budget-segments" aria-hidden="true">{[option.lodging, option.transit, option.visits, option.dining].map((cost, i) => <span key={i} className={`budget-color-${i}`} style={{ width: `${cost / subtotal * 100}%` }} />)}</div>
            <div className="budget-legend">{[['Stay', option.lodging], ['Local travel', option.transit], ['Visits', option.visits], ['Dining', option.dining]].map(([name, cost], i) => <div key={name}><i className={`budget-color-${i}`} /><span>{name}</span><strong>{money(Number(cost))}</strong></div>)}</div>
            <p className="demo-label">Illustrative values, not a live quote. Excludes getting to the city and a contingency buffer.</p>
          </div>
        </div></section>

        <section id="detours" className="story-chapter" data-chapter><div className="cloud-note">
          <div className="chapter-number">03 <span>THE UNPLANNED IS PART OF IT</span></div>
          <p className="city-kicker"><MapPin size={14} /> A slow afternoon in Bengaluru</p>
          <h2>Leave a little room<br /><em>for the detour.</em></h2>
          <p className="chapter-description">Travel happens outside the spreadsheet. Review your timeline, make changes with the planner’s available controls, and check how they affect the rest of your day.</p>
          <div className="interactive-card timeline-card"><div className="card-eyebrow">TRY IT · A DIFFERENT KIND OF AFTERNOON</div>
            <div className="sample-timeline"><div><time>12:30</time><span /><p>Lunch in the neighborhood<small>Take your time. Order something local.</small></p></div><div className="changing-stop" key={String(rest)}><time>14:00</time><span /><p>{rest ? 'A shady café & a proper pause' : 'An afternoon at the museum'}<small>{rest ? 'Room to recharge and watch the city go by.' : 'A little art, a little history, a fresh perspective.'}</small></p></div><div><time>17:00</time><span /><p>Catch the evening light<small>A gentler ending to a good day.</small></p></div></div>
            <button className="detour-toggle" aria-pressed={rest} onClick={() => setRest(!rest)}><Coffee size={17} />{rest ? 'Bring back the museum' : 'I could use a café break'}<ArrowRight size={16} /></button>
            <p className="demo-label">A visual example. Real itinerary changes need fresh feasibility checks.</p>
          </div>
        </div></section>

        <section id="together" className="story-chapter" data-chapter><div className="cloud-note">
          <div className="chapter-number">04 <span>GOOD COMPANY, CLEAR NUMBERS</span></div>
          <p className="city-kicker"><MapPin size={14} /> Making memories in Mumbai</p>
          <h2>Share the moments.<br /><em>And the math.</em></h2>
          <p className="chapter-description">Keep the itinerary easy to share and the expenses easy to understand. Record who paid, see balances, and spend less of the trip asking “who owes what?”</p>
          <div className="interactive-card split-card"><div className="card-eyebrow">TRY IT · SPLIT A ₹2,400 GROUP BILL</div>
            <div className="people-control"><div><Users size={23} /><span>{people} good people</span></div><div><button aria-label="One fewer traveler" disabled={people <= 2} onClick={() => setPeople(value => Math.max(2, value - 1))}><Minus size={16} /></button><button aria-label="One more traveler" disabled={people >= 6} onClick={() => setPeople(value => Math.min(6, value + 1))}><Plus size={16} /></button></div></div>
            <div className="share-avatars">{shares.map((share, i) => <div key={i}><span style={{ transform: `rotate(${i % 2 ? 5 : -5}deg)` }}>{['YOU', 'A', 'B', 'C', 'D', 'E'][i]}</span><strong>{money(share)}</strong></div>)}</div>
            <p className="split-total"><Check size={15} /> Every rupee accounted for. Total: ₹2,400.</p>
            <p className="demo-label">Local interactive example. Nothing is saved or paid here.</p>
          </div>
        </div></section>
      </div>

      <aside className="journey-stage" aria-label="Interactive miniature travel world">
        <div className="scene-topline"><span><i className="status-light" /> THE FOREST LINE / A TRIPWEAVE FIELD GUIDE</span><span>INDIA / VOL. 01</span></div>
        <div className="scene-orbit orbit-one" /><div className="scene-orbit orbit-two" /><div className="scene-sun" />
        <TravelWorld weather={weather} progress={progress} night={night} paused={paused} rotation={rotation} />
        <div className="scene-postmark">TAKE THE<strong>scenic route.</strong><span>WITH TRIPWEAVE</span></div>
        <div className="scene-controls" hidden={!journeyVisible}><div className="weather-icons" role="group" aria-label="Illustrated weather">{[{value:'clear',label:'Sunshine',icon:Sun},{value:'mist',label:'Mountain mist',icon:CloudFog},{value:'rain',label:'Gentle rain',icon:CloudRain}].map(item => <button key={item.value} onClick={() => setWeather(item.value)} aria-label={item.label} title={item.label} aria-pressed={weather === item.value}><item.icon size={19} /></button>)}</div><button onClick={() => setNight(!night)} aria-label={night ? 'Switch to daytime scenery' : 'Switch to evening scenery'} aria-pressed={night} title="Day / evening">{night ? <Sun size={18} /> : <Moon size={18} />}</button><button onClick={() => setRotation(value => value + Math.PI / 4)} aria-label="Rotate the miniature world" title="Rotate world"><RotateCcw size={18} /></button><button onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume ambient animation' : 'Pause ambient animation'} aria-pressed={paused} title="Pause / play">{paused ? <Play size={18} /> : <Pause size={18} />}</button></div>
        <div className="scene-bottom"><div className="station-readout"><div><span>NOW EXPLORING</span><strong>{stations[station].city}</strong></div><p>{stations[station].coordinates}<span>0{station + 1} <i>/ 05</i></span></p></div>
          <div className="rail-progress"><div ref={progressBar} /></div>
          <nav className="station-navigation" aria-label="Journey stops">{stations.map((stop, i) => <a key={stop.id} className={station === i ? 'current' : ''} href={`#${stop.id}`} aria-current={station === i ? 'step' : undefined}><span>{i < station ? <Check size={12} /> : i + 1}</span><strong>{stop.city}</strong></a>)}</nav>
          <p className="scene-caption">An illustrated journey. Not a real rail route.</p>
        </div>
      </aside>
    </div>

    <div className="arrival-strip"><TrainFront size={20} /><span>YOU’VE ARRIVED. NOW MAKE IT YOUR OWN.</span><span>↓</span></div>

    <section className="destinations-section section-shell" id="destinations"><div className="section-heading"><div><div className="eyebrow">A FEW PLACES TO BEGIN</div><h2>Different cities.<br /><em>Endless little stories.</em></h2></div><p>Pick a destination to open a sample request in the planner. Your next chapter starts with a single choice.</p></div>
      <div className="destination-cards">{stations.map((stop, i) => <button className={`destination-card city-${i}`} key={stop.city} onClick={() => openExample(stop.city)}><span className="postcard-top">INDIA <span>0{i + 1}</span></span><LandmarkStamp index={i} /><strong>{stop.city}</strong><span>{['Heritage & hidden lanes', 'Pink walls & golden light', 'Old stories, new energy', 'Gardens & coffee breaks', 'Sea breeze & city dreams'][i]}<ArrowRight size={15} /></span></button>)}</div>
      <p className="section-note">Sample requests use dates next week and a ₹15,000 group budget. Review the details and availability in the planner.</p>
    </section>

    <section className="manual-section section-shell" id="user-manual"><div className="section-heading"><div><div className="eyebrow">YOUR POCKET FIELD GUIDE</div><h2>A little know-how.<br /><em>A smoother getaway.</em></h2></div><p>From the first idea to the last shared bill. Here’s how to make yourself at home.</p></div>
      <div className="manual-tabs" role="tablist" aria-label="User guide topics">{manuals.map((item, i) => <button key={item.title} id={`manual-tab-${i}`} role="tab" aria-selected={manualTab === i} aria-controls="manual-panel" tabIndex={manualTab === i ? 0 : -1} onClick={() => setManualTab(i)} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? manuals.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + manuals.length) % manuals.length; setManualTab(next); document.getElementById(`manual-tab-${next}`)?.focus(); } }}><item.icon size={18} />{item.title}</button>)}</div>
      <div className="manual-panel" id="manual-panel" role="tabpanel" aria-labelledby={`manual-tab-${manualTab}`} tabIndex={0}>{manuals[manualTab].steps.map(([title, text], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="idea-section"><div className="section-shell"><div className="eyebrow">THE IDEA BEHIND THE JOURNEY</div><h2>Less tab-switching.<br /><em>More trip-making.</em></h2><p className="idea-intro">Trip planning gets complicated when every decision lives somewhere else. TripWeave’s proposal is simple: bring the important decisions together, and make the tradeoffs understandable.</p><div className="idea-cards">{[{ icon: Wallet, title: 'Know what fits.', text: 'Bring time and estimated spending into the same conversation, before the trip begins.' }, { icon: Users, title: 'Get on the same page.', text: 'Give the group a plan they can understand, share, and use as a starting point.' }, { icon: Sparkles, title: 'Keep discovering.', text: 'Make space for interests and new places without forgetting real-world constraints.' }].map(item => <article key={item.title}><item.icon size={25} strokeWidth={1.5} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div><p className="roadmap-note"><span>ON THE HORIZON</span> Shared live collaboration, richer provider data, and deeper trip adjustments are future directions—not promises of current availability.</p></div></section>

    <section className="faq-section section-shell" id="questions"><div><div className="eyebrow">BEFORE YOU SET OFF</div><h2>Good questions.<br /><em>Honest answers.</em></h2><p>A little clarity makes a better travel companion.</p></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={17} /></summary><p>{answer}</p></details>)}</div></section>

    <section className="boarding-section section-shell"><div className="boarding-pass"><div className="boarding-main"><div className="eyebrow"><Ticket size={17} /> YOUR NEXT CHAPTER</div><h2>Shall we <em>go somewhere?</em></h2><p>You bring the curiosity. Let’s start putting the trip together.</p><div className="boarding-form"><label htmlFor="journey-destination">WHERE TO?<select id="journey-destination" value={destination} onChange={event => setDestination(event.target.value)}>{stations.map(stop => <option key={stop.city}>{stop.city}</option>)}</select></label><button className="journey-button" onClick={() => openExample(destination)}>Start my trip <ArrowRight size={18} /></button></div></div><div className="boarding-stub"><Compass size={58} strokeWidth={1} /><span>ADMIT ONE<br /><strong>CURIOUS TRAVELER</strong></span><div className="ticket-barcode" /><small>THE GOOD PART STARTS HERE</small></div></div></section>
    <footer className="journey-footer"><Link className="journey-brand" href="/guide"><Compass size={21} />TripWeave</Link><span>Made for the journey. And the people on it.</span><a href="#departure">Back to departure ↑</a></footer>
  </main>;
}
