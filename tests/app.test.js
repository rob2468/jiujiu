import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAnswer, makeDeck, assess} from '../public/core.js';
function setup({speech=true,speechThrows=false}={}) {
 let now=0,nextId=0;const timers=new Map();
 class Element {constructor(){this.children=[];this.value='';this.checked=false;this.disabled=false;this.dataset={};this.events={};this.style={setProperty(){}};} addEventListener(n,f){this.events[n]=f;} setAttribute(n,v){this[n]=v;} replaceChildren(...c){this.children=c;} append(c){this.children.push(c);} }
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('chances').children=[new Element(),new Element(),new Element()];
 const buttons=Array.from({length:12},()=>new Element());const document={hidden:false,events:{},getElementById:get,querySelectorAll:()=>buttons,createElement:()=>new Element(),createTextNode:text=>({text}),addEventListener(n,f){this.events[n]=f;}};
 const synth={current:null,speaking:false,cancel(){this.current=null;this.speaking=false;},getVoices(){return [{lang:'zh-CN'}];},speak(u){if(speechThrows)throw new Error('Speech unavailable');this.current=u;this.speaking=true;}};
 const window={speechSynthesis:speech?synth:undefined,SpeechSynthesisUtterance:speech?class {constructor(text){this.text=text;}}:undefined,matchMedia:()=>({matches:true}),addEventListener(){}};
 const context={document,window,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,parseAnswer,makeDeck,assess,setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},console};
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'')+'\nglobalThis.appTest={state,nextQuestion,pause,submitAnswer};';
 vm.runInNewContext(source,context);
 function tick(ms){const until=now+ms;while(true){const entry=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=until;}
 return {...context.appTest,get,document,synth,tick};
}
function submit(t,value){t.get('answer').value=String(value);t.get('answer-form').events.submit({preventDefault(){}});}
test('answer is enabled during narration and correct submission immediately advances',()=>{
 const t=setup();t.nextQuestion();const oldSpeech=t.synth.current;
 assert.ok(oldSpeech);assert.equal(t.state.phase,'ready');assert.equal(t.get('answer').disabled,false);assert.equal(t.get('submit').disabled,false);
 submit(t,t.state.question.a*t.state.question.b);
 assert.equal(t.state.round,2);assert.equal(t.state.correct,1);assert.equal(t.state.completed,1);
 assert.equal(t.get('answer').value,'');assert.notEqual(t.synth.current,oldSpeech);
 oldSpeech.onend?.();oldSpeech.onerror?.();t.tick(50000);assert.equal(t.state.round,2);
});
test('ten consecutive correct answers require no speech events or timer ticks',()=>{
 const t=setup();t.nextQuestion();
 for(let i=0;i<10;i++)submit(t,t.state.question.a*t.state.question.b);
 assert.equal(t.state.round,11);assert.equal(t.state.completed,10);assert.equal(t.state.streak,10);
 submit(t,'');assert.equal(t.state.round,11);assert.equal(t.state.attempts,0);
});
test('incorrect answers allow immediate retry; third error offers an immediate next button',()=>{
 const t=setup();t.nextQuestion();
 for(let i=1;i<=3;i++){submit(t,0);assert.equal(t.state.attempts,i);assert.equal(t.state.resolved,i===3);}
 assert.equal(t.state.completed,1);assert.equal(t.state.correct,0);
 assert.equal(t.get('answer').disabled,true);assert.equal(t.get('submit').disabled,false);assert.equal(t.get('submit').textContent,'下一题');
 const reveal=t.synth.current;t.tick(50000);assert.equal(t.state.round,1);
 submit(t,'');assert.equal(t.state.round,2);assert.equal(t.state.attempts,0);assert.equal(t.get('submit').textContent,'提交');assert.notEqual(t.synth.current,reveal);
});
test('invalid input does not spend an attempt',()=>{
 const t=setup();t.nextQuestion();submit(t,'');
 assert.equal(t.state.attempts,0);assert.equal(t.state.phase,'ready');
});
test('replay preserves typed answer and allows submission immediately',()=>{
 const t=setup();t.nextQuestion();t.get('answer').value=String(t.state.question.a*t.state.question.b);
 t.get('replay').events.click();assert.notEqual(t.get('answer').value,'');assert.equal(t.get('submit').disabled,false);
 t.get('answer-form').events.submit({preventDefault(){}});assert.equal(t.state.round,2);
});
test('pause cancels speech, prevents submission, and resume preserves partial input',()=>{
 const t=setup();t.nextQuestion();t.get('answer').value='4';t.pause();t.tick(50000);
 assert.equal(t.state.phase,'paused');assert.equal(t.state.round,1);assert.equal(t.synth.current,null);
 t.get('answer-form').events.submit({preventDefault(){}});assert.equal(t.state.attempts,0);
 t.get('start').events.click();assert.equal(t.state.phase,'ready');assert.equal(t.get('answer').value,'4');
});
test('missing synthesis allows immediate keyboard practice',()=>{
 const t=setup({speech:false});t.nextQuestion();assert.equal(t.state.phase,'ready');
 submit(t,t.state.question.a*t.state.question.b);assert.equal(t.state.round,2);
});
test('a throwing speech service cannot block answering or progression',()=>{
 const t=setup({speechThrows:true});t.nextQuestion();submit(t,t.state.question.a*t.state.question.b);
 assert.equal(t.state.round,2);assert.equal(t.get('answer').disabled,false);
});
test('typing and keypad input interrupt speech without discarding input',()=>{
 const t=setup();t.nextQuestion();t.get('answer').value='12';t.get('answer').events.input();
 assert.equal(t.synth.current,null);assert.equal(t.get('answer').value,'12');
 t.get('replay').events.click();assert.ok(t.synth.current);
 t.get('keypad').events.click({target:{closest:()=>({dataset:{digit:'3'},disabled:false})}});
 assert.equal(t.synth.current,null);assert.equal(t.get('answer').value,'123');
});
test('backgrounding pauses a running session',()=>{
 const t=setup();t.nextQuestion();t.document.hidden=true;t.document.events.visibilitychange();
 t.tick(50000);assert.equal(t.state.phase,'paused');assert.equal(t.state.round,1);assert.equal(t.synth.current,null);
});
