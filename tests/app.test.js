import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAnswer, makeDeck, assess} from '../public/core.js';
function setup({speech=true}={}) {
 let now=0,nextId=0;const timers=new Map();
 class Element {constructor(){this.children=[];this.value='';this.checked=false;this.disabled=false;this.dataset={};this.events={};this.style={setProperty(){}};} addEventListener(n,f){this.events[n]=f;} setAttribute(n,v){this[n]=v;} replaceChildren(...c){this.children=c;} append(c){this.children.push(c);} }
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('chances').children=[new Element(),new Element(),new Element()];
 const buttons=Array.from({length:12},()=>new Element());const document={hidden:false,events:{},getElementById:get,querySelectorAll:()=>buttons,createElement:()=>new Element(),createTextNode:text=>({text}),addEventListener(n,f){this.events[n]=f;}};
 const synth={current:null,speaking:false,cancel(){this.current=null;this.speaking=false;},getVoices(){return [{lang:'zh-CN'}];},speak(u){this.current=u;this.speaking=true;}};
 const window={speechSynthesis:speech?synth:undefined,SpeechSynthesisUtterance:speech?class {constructor(text){this.text=text;}}:undefined,matchMedia:()=>({matches:true}),addEventListener(){}};
 const context={document,window,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,parseAnswer,makeDeck,assess,setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},console};
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'')+'\nglobalThis.appTest={state,nextQuestion,pause,submitAnswer};';
 vm.runInNewContext(source,context);
 function tick(ms){const until=now+ms;while(true){const entry=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=until;}
 function finishSpeech(){const u=synth.current;assert.ok(u,'has speech');synth.current=null;synth.speaking=false;u.onend();tick(450);}
 return {...context.appTest,get,document,synth,tick,finishSpeech};
}
test('typed answer advances once after feedback',()=>{
 const t=setup();t.nextQuestion();assert.equal(t.state.phase,'asking');assert.equal(t.get('answer').disabled,true);
 t.finishSpeech();assert.equal(t.state.phase,'ready');
 t.get('answer').value=String(t.state.question.a*t.state.question.b);
 t.get('answer-form').events.submit({preventDefault(){}});
 t.submitAnswer(t.state.question.a*t.state.question.b);
 assert.equal(t.state.correct,1);assert.equal(t.state.completed,1);
 t.finishSpeech();t.tick(900);assert.equal(t.state.round,2);
});
test('three incorrect answers reveal the result and advance',()=>{
 const t=setup();t.nextQuestion();
 for(let i=1;i<=3;i++){t.finishSpeech();t.submitAnswer(0);assert.equal(t.state.attempts,i);assert.equal(t.state.resolved,i===3);}
 assert.equal(t.state.completed,1);assert.equal(t.state.correct,0);
 t.finishSpeech();t.tick(2000);assert.equal(t.state.round,2);
});
test('invalid input does not spend an attempt',()=>{
 const t=setup();t.nextQuestion();t.finishSpeech();
 t.get('answer').value='';t.get('answer-form').events.submit({preventDefault(){}});
 assert.equal(t.state.attempts,0);assert.equal(t.state.phase,'ready');
});
test('pause cancels speech and ignores its late callback',()=>{
 const t=setup();t.nextQuestion();const stale=t.synth.current.onend;
 t.pause();stale();t.tick(50000);
 assert.equal(t.state.phase,'paused');assert.equal(t.state.round,1);assert.equal(t.synth.current,null);
 t.get('start').events.click();assert.equal(t.state.phase,'asking');assert.equal(t.state.round,1);
});
test('missing synthesis still allows keyboard practice',()=>{
 const t=setup({speech:false});t.nextQuestion();t.tick(220);assert.equal(t.state.phase,'ready');
 t.submitAnswer(t.state.question.a*t.state.question.b);t.tick(1120);assert.equal(t.state.round,2);
});
test('backgrounding pauses a running session',()=>{
 const t=setup();t.nextQuestion();t.document.hidden=true;t.document.events.visibilitychange();
 t.tick(50000);assert.equal(t.state.phase,'paused');assert.equal(t.state.round,1);
});
