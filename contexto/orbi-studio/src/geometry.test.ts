import {describe,expect,it} from 'vitest';
import {fresh,normalizeDesign,pose} from './geometry';

const legKeys=(leg:ReturnType<typeof fresh>['left'])=>Object.keys(leg).sort();

describe('leg geometry without feet',()=>{
 it('keeps only hip, knee and ankle in a fresh leg',()=>{
  const design=fresh();

  expect(legKeys(design.left)).toEqual(['ankle','hip','knee']);
  expect(legKeys(design.right)).toEqual(['ankle','hip','knee']);
 });

 it('keeps all presets free of foot points',()=>{
  for(let index=0;index<30;index+=1){
   const design=pose(index);
   expect(legKeys(design.left)).toEqual(['ankle','hip','knee']);
   expect(legKeys(design.right)).toEqual(['ankle','hip','knee']);
  }
 });
});

describe('design normalization',()=>{
 it('drops legacy foot points while preserving the body',()=>{
  const current=fresh();
  const legacy={
   ...current,
   left:{...current.left,heel:{x:1,y:2},toe:{x:3,y:4}},
   right:{...current.right,heel:{x:5,y:6},toe:{x:7,y:8}},
  };

  expect(normalizeDesign(legacy)).toEqual(current);
 });

 it('rejects missing points and non-numeric coordinates',()=>{
  const incomplete={face:{},left:{ankle:{}},right:{ankle:{}}};
  const injected={...fresh(),left:{...fresh().left,hip:{x:'0\"/><script>alert(1)</script>',y:238}}};

  expect(()=>normalizeDesign(incomplete)).toThrow('Design inválido');
  expect(()=>normalizeDesign(injected)).toThrow('Design inválido');
 });
});
