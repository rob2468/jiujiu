import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnswer, makeDeck, assess} from '../dist/core.js';
test('Chinese and Arabic spoken answers are normalized',()=>{
 for(const [input,n] of [['六',6],['十',10],['十一',11],['二十',20],['四十二',42],['答案是五十六。',56],['我的答案是八十一',81],['是 ４２',42],['两',2],['一二',12],['等于63',63],['0',0],['一百',100]]) assert.equal(parseAnswer(input),n,input);
});
test('ambiguous or malformed transcripts do not cost an attempt',()=>{
 for(const input of ['',null,'不知道','四十二还是四十三','2+3','6乘7等于42','-5','1.5','一千','42个']) assert.equal(parseAnswer(input),null,String(input));
 assert.deepEqual(assess({a:6,b:7},null,1),{kind:'invalid',attempts:1});
});
test('correct response succeeds on each permitted try',()=>{
 for(let tries=0;tries<3;tries++) assert.deepEqual(assess({a:6,b:7},42,tries),{kind:'correct',attempts:tries});
});
test('exactly third incorrect answer reveals answer',()=>{
 let attempts=0;
 for(const kind of ['retry','retry','reveal']) {const r=assess({a:9,b:9},80,attempts);assert.equal(r.kind,kind); attempts=r.attempts;}
 assert.equal(attempts,3);
});
test('a deck contains all 81 1–9 questions exactly once',()=>{
 for(let i=0;i<20;i++){const d=makeDeck();assert.equal(d.length,81);assert.equal(new Set(d.map(q=>`${q.a},${q.b}`)).size,81);for(const q of d){assert.ok(q.a>=1&&q.a<=9&&q.b>=1&&q.b<=9)}}
});
test('new deck avoids repeating last completed question at its boundary',()=>{
 const previous={a:9,b:9};const d=makeDeck(()=>.9999,previous);assert.notDeepEqual(d.at(-1),previous);
});
