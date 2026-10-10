export default function PlannerLandscape() {
  return <div className="planner-landscape" aria-hidden="true"><svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="sunset-sky" x2="0" y2="1"><stop stopColor="#f1dfbd"/><stop offset=".5" stopColor="#f6c392"/><stop offset="1" stopColor="#bcc7ad"/></linearGradient><radialGradient id="sunset-glow"><stop stopColor="#fff4c5" stopOpacity=".9"/><stop offset="1" stopColor="#ffdfaa" stopOpacity="0"/></radialGradient></defs>
    <path fill="url(#sunset-sky)" d="M0 0h1600v1000H0z"/><circle cx="1450" cy="440" r="280" fill="url(#sunset-glow)"/><circle cx="1450" cy="440" r="84" fill="#fff1bb"/>
    <path d="M0 750L180 550 340 680 590 455 770 660 1020 500 1190 640 1400 420 1600 630V1000H0Z" fill="#989c8c"/>
    <path d="M0 800L210 680 420 820 680 625 880 815 1150 665 1360 770 1600 600V1000H0Z" fill="#738879"/><path d="M0 930L270 800 500 930 800 790 1030 900 1320 800 1600 885V1000H0Z" fill="#4c6b5c"/>
    <g transform="translate(-175 80) scale(.55 .75)"><g fill="none" stroke="#4c5941" strokeLinecap="round"><path d="M-50 105C100 160 150 295 350 350C440 376 515 345 595 305" strokeWidth="24"/><path d="M200 278L165 150M370 355L400 240M80 195L30 340" strokeWidth="11"/></g>
    <g fill="#71874c">{[ [165,160,-30],[390,250,25],[330,342,-35],[100,230,20],[530,332,-20],[47,300,-25] ].map(([x,y,angle],i) => <ellipse key={i} cx={x} cy={y} rx="52" ry="21" transform={`rotate(${angle} ${x} ${y})`}/>)}</g>
    <g className="sunset-bird"><ellipse cx="536" cy="300" rx="24" ry="15" fill="#364c42"/><circle cx="556" cy="287" r="12" fill="#364c42"/><path d="M565 285L579 291 564 295" fill="#b76f3c"/><path d="M516 298L483 306 519 313" fill="#364c42"/><path className="bird-wing" d="M528 294Q490 264 505 293Q514 312 541 307" fill="#819065"/><circle cx="560" cy="284" r="2" fill="#fff8df"/></g>
    </g>
  </svg></div>;
}
