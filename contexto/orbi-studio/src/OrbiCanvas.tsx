import React, {useRef} from 'react';
import {type Design,type DragKey,type P,COLORS,normalizeDesign,pathLeg} from './geometry';
const {ink,orange,cream,cyan}=COLORS;
const HEAD={x:150,y:148,r:112};
export const OLED_PATH='M 0 -72 C 49 -72 76 -62 84 -38 C 89 -23 90 7 87 23 C 84 39 76 43 60 39 C 20 29 -20 29 -60 39 C -76 43 -84 39 -87 23 C -90 7 -89 -23 -84 -38 C -76 -62 -49 -72 0 -72 Z';
export function Eyes({style=0,shiftX=0,shiftY=0}:{style:number;shiftX?:number;shiftY?:number}){
 const shifts={7:-9,8:9,9:0,10:0} as Record<number,number>;
 const y=shiftY+(style===9?-8:style===10?8:0),x=shiftX+(shifts[style]||0);
 return <g transform={`translate(${x} ${y})`}>{[-33,33].map((xx,i)=>{
 if([11,12,13,14,15].includes(style))return <path key={i} d={`M${xx-13} -10 Q${xx} ${style===11?-32:-18} ${xx+13} -10`} stroke={cyan} fill="none" strokeWidth="7" strokeLinecap="round"/>;
 if(style===20)return <path key={i} d={`M${xx} 12 C${xx-28} -5 ${xx-14} -26 ${xx} -18 C${xx+14} -26 ${xx+28} -5 ${xx} 12Z`} fill={cyan}/>;
 if(style===21||style===29)return <path key={i} d={Array.from({length:10},(_,j)=>{const a=-Math.PI/2+j*Math.PI/5,r=j%2?8:19;return `${j?'L':'M'}${xx+Math.cos(a)*r} ${-8+Math.sin(a)*r}`}).join(' ')+'Z'} fill={cyan}/>;
 if(style===22)return <rect key={i} x={xx-10} y="-22" width="20" height="30" rx="4" fill={cyan}/>;
 const sizes:Record<number,[number,number]>={1:[15,25],2:[7,14],3:[5,5],4:[5,23],5:[17,17],6:[14,14],16:[10,12],17:[13,20],18:[16,26],23:i?[15,24]:[7,18],24:[11,23],25:[9,22],26:[8,19],27:[13,25],28:[7,18]};const [rx,ry]=sizes[style]||[11,23];
 return <g key={i}><ellipse cx={xx} cy="-7" rx={rx} ry={ry} fill={cyan}/>{[16,17,26,28].includes(style)&&<path d={`M${xx-15} -27 L${xx+15} ${style===17?-33:-17}`} stroke={ink} strokeWidth="6"/>}{style===24&&<circle cx={xx-3} cy="-15" r="3" fill="white"/>}</g>;
 })}</g>
}
export function Mouth({style=0}:{style:number}){
 const ellipse:Record<number,[number,number]>={0:[10,16],1:[6,7],2:[18,24],12:[9,6],13:[8,10],14:[5,12],15:[19,25],16:[12,8],17:[14,22],24:[15,23]};
 if(ellipse[style])return <ellipse cx="0" cy="62" rx={ellipse[style][0]} ry={ellipse[style][1]} fill={ink}/>;
 if([4,5,10,22,23,26].includes(style))return <rect x="-18" y="51" width="36" height="24" rx={style===23?3:12} fill={ink}/>;
 const d:Record<number,string>={3:'M-19 54 Q0 77 19 54',6:'M-17 62 L17 62',7:'M-18 76 Q0 47 18 76',8:'M-23 79 Q0 41 23 79',9:'M-16 62 H16',11:'M-12 64 H12',18:'M-15 64 Q0 69 15 64',19:'M-17 64 Q-5 74 9 62',20:'M-9 62 Q4 74 17 64',21:'M-17 64 L-8 55 L0 68 L8 55 L17 64',25:'M-19 60 H19',27:'M-15 57 Q-3 74 13 61',28:'M-9 68 Q0 77 9 68',29:'M-13 63 H13'};
 return <path d={d[style]||'M-17 62 Q0 77 17 62'} fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>;
}
export function OrbiArt({design,controls=false,onMove,focus,viewBox='0 0 300 390'}:{design:Design;controls?:boolean;onMove?:(key:DragKey,p:P)=>void;focus?:string;viewBox?:string}){
 const ref=useRef<SVGSVGElement>(null);const drag=useRef<DragKey|null>(null);
 const toSVG=(e:React.PointerEvent<SVGSVGElement>)=>{const svg=ref.current!;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const ctm=svg.getScreenCTM();if(!ctm)return null;const local=pt.matrixTransform(ctm.inverse());return{x:Math.round(local.x),y:Math.round(local.y)}};
 const move=(e:React.PointerEvent<SVGSVGElement>)=>{if(!drag.current||!onMove)return;const p=toSVG(e);if(p)onMove(drag.current,p)};
 const dot=(key:DragKey,p:P,color:string)=> <g key={key} transform={`translate(${p.x} ${p.y})`} className="ctl-dot" onPointerDown={e=>{e.preventDefault();e.stopPropagation();drag.current=key;ref.current?.setPointerCapture(e.pointerId)}}><circle r="12" fill={color} fillOpacity=".16" stroke={color} strokeWidth="1.5"/><circle r="4" fill={color}/></g>;
 return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} className="w-full h-full select-none" onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} style={{touchAction:'none'}}>
 <defs><clipPath id="orbi-head-clip"><circle cx={HEAD.x} cy={HEAD.y} r="103"/></clipPath></defs>
 {(['left','right'] as const).map(side=>{const l=design[side];return <g key={`${side}.leg`}>
 <path d={pathLeg(l)} stroke="white" strokeWidth="63" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
 <path d={pathLeg(l)} stroke={ink} strokeWidth="51" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
 <path d={pathLeg(l)} stroke={orange} strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
 </g>})}
 <circle cx={HEAD.x} cy={HEAD.y} r="124" fill="white"/>
 <circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r} fill={orange} stroke={ink} strokeWidth="12"/>
 <g clipPath="url(#orbi-head-clip)"><g transform={`translate(${HEAD.x+design.face.x} ${HEAD.y+design.face.y}) rotate(${design.face.rotation}) scale(${design.face.scale})`}>
 <path d={OLED_PATH} fill={ink} stroke={cream} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
 <Eyes style={design.face.eyeStyle} shiftX={design.face.eyeShiftX} shiftY={design.face.eyeShiftY}/><Mouth style={design.face.mouthStyle}/>
 </g></g>
 {controls&&<g>
 {(['left','right'] as const).flatMap(side=>{const l=design[side];return [
  dot(`${side}.hip` as DragKey,l.hip,'#a78bfa'),
  dot(`${side}.knee` as DragKey,l.knee,'#06d7e2'),
  dot(`${side}.ankle` as DragKey,l.ankle,'#f59e0b'),
 ]})}
 {dot('face.position',{x:150+design.face.x,y:148+design.face.y},'#38e0ef')}
 <text x="7" y="19" fontSize="9" fill="#9db6c3">{focus||'Arraste os pontos'}</text>
 </g>}
 </svg>
}
export function svgMarkup(d:Design){d=normalizeDesign(d);const s=(p:string)=>p;const leg=(l:Design['left'])=>`<path d="${pathLeg(l)}" stroke="white" stroke-width="63" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="${pathLeg(l)}" stroke="${ink}" stroke-width="51" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="${pathLeg(l)}" stroke="${orange}" stroke-width="27" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
 const eyes=[-33,33].map(x=>`<ellipse cx="${x+d.face.eyeShiftX}" cy="${-7+d.face.eyeShiftY}" rx="11" ry="23" fill="${cyan}"/>`).join('');
 return s(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 390"><defs><clipPath id="head"><circle cx="150" cy="148" r="103"/></clipPath></defs>${leg(d.left)}${leg(d.right)}<circle cx="150" cy="148" r="124" fill="white"/><circle cx="150" cy="148" r="112" fill="${orange}" stroke="${ink}" stroke-width="12"/><g clip-path="url(#head)" transform=""><g transform="translate(${150+d.face.x} ${148+d.face.y}) rotate(${d.face.rotation}) scale(${d.face.scale})"><path d="${OLED_PATH}" fill="${ink}" stroke="${cream}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>${eyes}<ellipse cx="0" cy="62" rx="10" ry="16" fill="${ink}"/></g></g></svg>`);
}
