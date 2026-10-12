export default function PlannerLandscape() {
  return <div className="planner-landscape" aria-hidden="true"><svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="terrain-paper" x2="1" y2="1"><stop stopColor="#f7f4e9"/><stop offset="1" stopColor="#e6ecdf"/></linearGradient></defs>
    <path fill="url(#terrain-paper)" d="M0 0h1600v1000H0z"/>
    <g fill="none" stroke="#738b71" strokeWidth="1" opacity=".22">{Array.from({length:16},(_,i)=><path key={i} d={`M${980+i*32} -100 C${600+i*35} 160 ${1530+i*18} 240 ${1100+i*26} 530 S${800+i*30} 860 ${1400+i*18} 1100`}/>)}</g>
    <circle cx="1410" cy="190" r="110" fill="#dba768" opacity=".12"/>
    <path d="M1180 650 Q1250 550 1340 595 T1510 490" fill="none" stroke="#a87b4e" strokeDasharray="5 9" opacity=".3"/>
  </svg></div>;
}
