import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAnswer, makeDeck, assess} from '../public/core.js';
function setup({recognition=true,speech=true}={}) {
 let now=0,nextId=0;const timers=new Map();
 class Element {constructor(){this.children=[];this.value='';this.checked=false;this.disabled=false;this.dataset={};this.events={};this.style={setProperty(){}};} addEventListener(n,f){this.events[n]=f;} setAttribute(n,v){this[n]=v;} replaceChildren(...c){this.children=c;} append(c){this.children.push(c);} }
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('auto-voice').checked=true;get('chances').children=[new Element(),new Element(),new Element()];
 const buttons=Array.from({length:12},()=>new Element());const document={hidden:false,events:{},getElementById:get,querySelectorAll:()=>buttons,createElement:()=>new Element(),createTextNode:text=>({text}),addEventListener(n,f){this.events[n]=f;}};
 const synth={current:null,speaking:false,cancel(){this.current=null;this.speaking=false;},getVoices(){return [{lang:'zh-CN'}];},speak(u){assert.equal(Rec.current?.running??false,false,'recognition must stop before speaking');this.current=u;this.speaking=true;}};
 class Rec {static current=null;constructor(){Rec.current=this;} start(){assert.equal(synth.speaking,false,'synthesis must finish before listening');this.running=true;this.onstart?.();} abort(){this.running=false;} answer(text){this.running=false;const result=[{transcript:text}];result.isFinal=true;this.onresult?.({resultIndex:0,results:[result]});} }
 const window={SpeechRecognition:recognition?Rec:undefined,speechSynthesis:speech?synth:undefined,SpeechSynthesisUtterance:speech?class {constructor(text){this.text=text;}}:undefined,matchMedia:()=>({matches:true}),addEventListener(){}};
 const context={document,window,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,parseAnswer,makeDeck,assess,setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},console};
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'')+'\nglobalThis.appTest={state,nextQuestion,pause,listen,submitAnswer};';
 vm.runInNewContext(source,context);
 function tick(ms){const until=now+ms;while(true){const entry=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=until;}
 function finishSpeech(){const u=synth.current;assert.ok(u,'has speech');synth.current=null;synth.speaking=false;u.onend();tick(450);}
 return {...context.appTest,get,document,synth,Rec,tick,finishSpeech};
}
test('speech finishes before listening; correct spoken answer advances once',()=>{
 const t=setup();t.nextQuestion();assert.equal(t.state.phase,'asking');assert.equal(t.Rec.current,null);
 t.finishSpeech();assert.equal(t.state.phase,'listening');const q=t.state.question;t.Rec.current.answer(String(q.a*q.b));
 assert.equal(t.state.correct,1);assert.equal(t.state.completed,1);assert.equal(t.state.phase,'feedback');
 t.finishSpeech();t.tick(900);assert.equal(t.state.round,2);assert.equal(t.state.attempts,0);assert.equal(t.state.phase,'asking');
});
test('three spoken errors reveal answer, then move to next question',()=>{
 const t=setup();t.nextQuestion();
 for(let i=1;i<=3;i++){t.finishSpeech();t.Rec.current.answer('零');assert.equal(t.state.attempts,i);assert.equal(t.state.resolved,i===3);}
 assert.equal(t.state.completed,1);assert.equal(t.state.correct,0);assert.equal(t.get('result-value').textContent,t.state.question.a*t.state.question.b);
 t.finishSpeech();t.tick(2000);assert.equal(t.state.round,2);assert.equal(t.state.attempts,0);
});
test('unclear recognition is not an incorrect attempt',()=>{
 const t=setup();t.nextQuestion();t.finishSpeech();t.Rec.current.answer('我不知道');assert.equal(t.state.attempts,0);assert.equal(t.state.phase,'ready');
});
test('permission denial falls back without spending an attempt',()=>{
 const t=setup();t.nextQuestion();t.finishSpeech();t.Rec.current.onerror({error:'not-allowed'});assert.equal(t.state.attempts,0);assert.equal(t.state.phase,'ready');assert.equal(t.get('auto-voice').checked,false);assert.equal(t.get('answer').disabled,false);assert.equal(t.get('listen').disabled,true);
});
test('pause cancels speech, recognition, and delayed stale results',()=>{
 const t=setup();t.nextQuestion();t.finishSpeech();const stale=t.Rec.current.onresult;const answer=t.state.question.a*t.state.question.b;t.pause();const r=[{transcript:String(answer)}];r.isFinal=true;stale({resultIndex:0,results:[r]});t.tick(50000);assert.equal(t.state.phase,'paused');assert.equal(t.state.correct,0);assert.equal(t.state.round,1);assert.equal(t.Rec.current.running,false);
});
test('missing speech APIs still allows keypad practice',()=>{
 const t=setup({recognition:false,speech:false});assert.equal(t.get('auto-voice').disabled,true);t.nextQuestion();t.tick(220);assert.equal(t.state.phase,'ready');const q=t.state.question;t.submitAnswer(q.a*q.b);t.tick(1120);assert.equal(t.state.round,2);
});
test('backgrounding a running session pauses it',()=>{
 const t=setup();t.nextQuestion();t.document.hidden=true;t.document.events.visibilitychange();assert.equal(t.state.phase,'paused');t.tick(50000);assert.equal(t.state.round,1);
});
