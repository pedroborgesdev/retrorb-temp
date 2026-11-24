import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {fresh} from './geometry';
import {OLED_PATH,OrbiArt,svgMarkup} from './OrbiCanvas';

describe('OrbiArt without feet',()=>{
 it('renders only the head-matched leg strokes',()=>{
  const markup=renderToStaticMarkup(<OrbiArt design={fresh()}/>);

  expect(markup).toContain('stroke-width="63"');
  expect(markup).toContain('stroke-width="51"');
  expect(markup).toContain('stroke-width="27"');
  expect(markup).not.toContain('A 13 13');
 });

 it('does not show foot controls',()=>{
  const markup=renderToStaticMarkup(<OrbiArt design={fresh()} controls/>);

  expect(markup).not.toContain('stroke="#34d399"');
  expect(markup).not.toContain('stroke="#f472b6"');
 });
});

describe('svgMarkup without feet',()=>{
 it('exports legs without capsule paths',()=>{
  const markup=svgMarkup(fresh());

  expect(markup).toContain('stroke-width="63"');
  expect(markup).toContain('stroke-width="51"');
  expect(markup).not.toContain('A 13 13');
 });

 it('rejects non-numeric coordinates instead of emitting injected markup',()=>{
  const design={...fresh(),left:{...fresh().left,hip:{x:'0\"/><script>alert(1)</script>',y:238}}};

  expect(()=>svgMarkup(design as never)).toThrow('Design inválido');
 });
});

describe('OLED outline',()=>{
 it('uses one closed cubic-only path in both renderer and export',()=>{
  const commands=OLED_PATH.match(/[A-Za-z]/g);
  const rendered=renderToStaticMarkup(<OrbiArt design={fresh()}/>);
  const exported=svgMarkup(fresh());

  expect(commands).toEqual(['M','C','C','C','C','C','C','C','Z']);
  expect(OLED_PATH).not.toMatch(/[QLHV]/);
  expect(rendered).toContain(`d="${OLED_PATH}"`);
  expect(exported).toContain(`d="${OLED_PATH}"`);
 });

 it('keeps aligned forward tangents at every cubic join',()=>{
  const values=(OLED_PATH.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
  const start={x:values[0],y:values[1]};
  const curves=Array.from({length:7},(_,index)=>{
   const offset=2+index*6;
   return {
    c1:{x:values[offset],y:values[offset+1]},
    c2:{x:values[offset+2],y:values[offset+3]},
    end:{x:values[offset+4],y:values[offset+5]},
   };
  });

  curves.forEach((curve,index)=>{
   const next=curves[(index+1)%curves.length];
   const join=curve.end;
   const incoming={x:join.x-curve.c2.x,y:join.y-curve.c2.y};
   const outgoing={x:next.c1.x-join.x,y:next.c1.y-join.y};

   expect(incoming.x*outgoing.y-incoming.y*outgoing.x).toBe(0);
   expect(incoming.x*outgoing.x+incoming.y*outgoing.y).toBeGreaterThan(0);
  });
  expect(curves.at(-1)?.end).toEqual(start);
 });
});
