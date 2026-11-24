export type P = { x:number;y:number };
export type Leg = { hip:P; knee:P; ankle:P };
export type Face = { x:number;y:number;rotation:number;scale:number;eyeStyle:number;mouthStyle:number;eyeShiftX:number;eyeShiftY:number };
export type Design = { left:Leg;right:Leg;face:Face };
export type DragKey='left.hip'|'left.knee'|'left.ankle'|'right.hip'|'right.knee'|'right.ankle'|'face.position';
export const COLORS={ink:'#082d3b',orange:'#ff791b',cream:'#fff4dc',cyan:'#06d7e2'};
const invalidDesign=()=>new Error('Design inválido');
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalidDesign();return value as Record<string,unknown>};
const finite=(value:unknown):number=>{if(typeof value!=='number'||!Number.isFinite(value))throw invalidDesign();return value};
const point=(value:unknown):P=>{const source=record(value);return{x:finite(source.x),y:finite(source.y)}};
const leg=(value:unknown):Leg=>{const source=record(value);return{hip:point(source.hip),knee:point(source.knee),ankle:point(source.ankle)}};
const face=(value:unknown):Face=>{const source=record(value);return{x:finite(source.x),y:finite(source.y),rotation:finite(source.rotation),scale:finite(source.scale),eyeStyle:finite(source.eyeStyle),mouthStyle:finite(source.mouthStyle),eyeShiftX:finite(source.eyeShiftX),eyeShiftY:finite(source.eyeShiftY)}};
export function normalizeDesign(value:unknown):Design{const source=record(value);return{left:leg(source.left),right:leg(source.right),face:face(source.face)}}
export const fresh=():Design=>({
 left:{hip:{x:114,y:238},knee:{x:106,y:270},ankle:{x:103,y:316}},
 right:{hip:{x:186,y:238},knee:{x:194,y:270},ankle:{x:197,y:316}},
 face:{x:0,y:0,rotation:0,scale:1,eyeStyle:0,mouthStyle:0,eyeShiftX:0,eyeShiftY:0}
});
export function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v)) as T}
export function pathLeg(l:Leg){const cx=2*l.knee.x-(l.hip.x+l.ankle.x)/2,cy=2*l.knee.y-(l.hip.y+l.ankle.y)/2;return `M ${l.hip.x} ${l.hip.y} Q ${cx} ${cy} ${l.ankle.x} ${l.ankle.y}`}
export const EYES=['Clássico','Grandes','Pequenos','Pontinhos','Finos','Largos','Redondos','Esquerda','Direita','Acima','Abaixo','Felizes','Fechados','Piscada E','Piscada D','Sonolentos','Bravos','Tristes','Surpresos','Focados','Corações','Estrelas','Quadrados','Assimétricos','Com brilho','Chorosos','Desconfiados','Curiosos','Irritados','Apaixonados'];
export const MOUTHS=['Surpreso','Mini O','O grande','Sorriso','Sorriso aberto','Risada','Neutra','Triste','Triste forte','Reta','Dentes','Sério','Bico','Beijo','Assobio','Grito','Sono','Bocejo','Pensativo','Lateral E','Lateral D','Zigue-zague','Triângulo','Quadrado','Espanto','Determinado','Gargalhada','Meio sorriso','Tímido','Fechada'];
export const POSES=['Sentado neutro','Sentado relaxado','Sentado pernas abertas','Sentado pernas juntas','Sentado inclinado E','Sentado inclinado D','Sentado pernas longas','Sentado encolhido','Sentado assimétrico','Sentado descansando','Em pé neutro','Em pé aberto','Em pé fechado','Em pé inclinado E','Em pé inclinado D','Passo E','Passo D','Salto','Corrida','Elevado','Deitado direita','Deitado esquerda','Deitado relaxado','Deitado lateral','Deitado encolhido','Deitado esticado','Deitado diagonal E','Deitado diagonal D','Deitado sonolento','Deitado repousando'];
const L=(hx:number,hy:number,kx:number,ky:number,ax:number,ay:number):Leg=>({hip:{x:hx,y:hy},knee:{x:kx,y:ky},ankle:{x:ax,y:ay}});
export function pose(n:number):Design{
 const d=fresh();const g=n<10?0:n<20?1:2,sub=n%10;
 const bends=[0,-12,18,-8,-20,20,-6,27,-17,9];
 if(g===0){const y=[265,270,278,268,277,277,280,266,268,274][sub];
 d.left=L(116,236,102+bends[sub],255,86-bends[sub]*.6,y);
 d.right=L(184,236,198-bends[sub],255,214+bends[sub]*.6,y);
 }else if(g===1){const offsets=[0,15,-15,-18,18,-27,27,3,-20,9][sub];
 d.left.knee.x+=offsets*.25;d.left.ankle.x+=offsets*.5;
 d.right.knee.x-=offsets*.25;d.right.ankle.x-=offsets*.5;
 const lift=[0,0,0,8,8,-13,0,-35,-17,-22][sub];
 for(const leg of [d.left,d.right])for(const k of ['knee','ankle'] as const)leg[k].y+=lift;
 }else{
 const angle=[-78,78,-90,-100,-65,88,-55,55,-110,92][sub]*Math.PI/180;
 const transform=(p:P)=>{const cx=150,cy=156,x=p.x-cx,y=p.y-cy;return{x:cx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+x*Math.sin(angle)+y*Math.cos(angle)}};
 for(const leg of [d.left,d.right])for(const k of ['hip','knee','ankle'] as const)leg[k]=transform(leg[k]);
 }
 return d;
}
