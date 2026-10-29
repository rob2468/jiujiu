import {parseAnswer, makeDeck, assess} from './core.js';
const $ = id => document.getElementById(id);
const synthesis = window.speechSynthesis;
const state = {phase:'idle', question:null, deck:[], attempts:0, round:0, correct:0, completed:0, streak:0, token:0, timers:new Set(), resolved:false};
const phaseNames = {idle:'等你开始',asking:'正在读题',ready:'轮到你啦',feedback:'一起记住',paused:'已暂停'};
function later(fn, ms, token=state.token){const id=setTimeout(()=>{state.timers.delete(id);if(token===state.token)fn();},ms);state.timers.add(id);return id;}
function cancelPending(){state.token++;for(const id of state.timers)clearTimeout(id);state.timers.clear();if(synthesis)synthesis.cancel();}
function feedback(title, detail, type=''){$('feedback-title').textContent=title;$('feedback-detail').textContent=detail;$('feedback').className=`feedback ${type}`;}
function render(){
 const active=state.phase!=='idle'&&state.phase!=='paused';
 const canAnswer=state.phase==='ready'&&!state.resolved;
 $('round-label').textContent=state.round?`第 ${String(state.round).padStart(2,'0')} 题`:'准备出发';
 $('phase-label').className=`phase-label ${state.phase}`;
 $('phase-label').textContent=phaseNames[state.phase];
 $('question-hint').textContent=state.phase==='idle'?'点击开始练习':state.phase==='paused'?'练习已暂停':state.resolved?'正确答案':'等于多少？';
 $('factor-a').textContent=state.question?.a??'?';$('factor-b').textContent=state.question?.b??'?';
 $('result-value').textContent=state.resolved?state.question.a*state.question.b:'?';$('result-value').className=`result-value ${state.resolved?'revealed':''}`;
 $('start-text').textContent=state.phase==='idle'?'开始练习':state.phase==='paused'?'继续练习':'暂停一下';$('start-icon').textContent=active?'Ⅱ':'▶';
 $('replay').disabled=!state.question||!active||state.resolved||['asking','feedback'].includes(state.phase);
 $('answer').disabled=!canAnswer;$('submit').disabled=!canAnswer;
 document.querySelectorAll('#keypad button').forEach(b=>b.disabled=!canAnswer);
 const left=3-state.attempts;$('attempt-count').textContent=`${left} 次`;$('chances').setAttribute('aria-label',`剩余${left}次机会`);
 [...$('chances').children].forEach((c,i)=>c.className=i<left?'':'used');
 $('correct-count').textContent=state.correct;$('completed-count').textContent=state.completed;$('streak-count').textContent=state.streak;
}
function say(text, done, token=state.token){
 if(!synthesis||!window.SpeechSynthesisUtterance){later(done,220,token);return;}
 const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=.88;utterance.pitch=1.05;
 const voices=synthesis.getVoices();const voice=voices.find(v=>/^zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;
 let finished=false;
 const finish=()=>{if(finished||token!==state.token)return;finished=true;later(done,450,token);};
 utterance.onend=finish;utterance.onerror=finish;
 later(()=>{if(!finished){synthesis.cancel();finish();}},Math.min(20000,4000+text.length*300),token);
 try{synthesis.speak(utterance);}catch{finish();}
}
function ready(){
 if(state.phase==='paused'||state.resolved)return;
 state.phase='ready';render();
 feedback('请输入答案','用数字键盘输入，再点击“提交”。');
}
function askCurrent(){
 cancelPending();state.phase='asking';$('answer').value='';feedback('正在读题','读完后输入答案。');render();
 say(`${state.question.a}乘以${state.question.b}等于多少？`,ready);
}
function nextQuestion(){
 if(state.phase==='paused')return;
 if(!state.deck.length)state.deck=makeDeck(Math.random,state.question);
 state.question=state.deck.pop();state.attempts=0;state.resolved=false;state.round++;askCurrent();
}
function submitAnswer(answer){
 if(state.phase!=='ready'||state.resolved)return;
 const outcome=assess(state.question,answer,state.attempts);
 if(outcome.kind==='invalid'){feedback('请输入一个数字','输入无效，不会扣除机会。');return;}
 cancelPending();state.attempts=outcome.attempts;state.phase='feedback';
 if(outcome.kind==='correct'){
   state.resolved=true;state.correct++;state.completed++;state.streak++;
   feedback('答对了',`${state.question.a} × ${state.question.b} = ${answer}，准备下一题。`,'success');render();
   say('恭喜你，答对啦！',()=>later(nextQuestion,900));
 }else if(outcome.kind==='retry'){
   feedback('差一点，再想一想',`${answer} 还不是答案。还有 ${3-state.attempts} 次机会。`,'retry');render();
   say(`还不对哦，再想一想。你还有${3-state.attempts}次机会。`,()=>{state.phase='ready';$('answer').value='';render();});
 }else{
   state.resolved=true;state.completed++;state.streak=0;
   feedback('没关系，一起记住答案',`${state.question.a} × ${state.question.b} = ${state.question.a*state.question.b}。停一停，再出发。`,'reveal');render();
   say(`没关系，正确答案是${state.question.a*state.question.b}。${state.question.a}乘以${state.question.b}等于${state.question.a*state.question.b}。我们继续下一题。`,()=>later(nextQuestion,2000));
 }
}
function pause(){cancelPending();state.phase='paused';feedback('休息一下，也很好','朗读已停止。点击“继续练习”接着来。');render();}
$('start').addEventListener('click',()=>{
 if(state.phase==='idle'){nextQuestion();}
 else if(state.phase==='paused'){state.phase='ready';if(state.resolved)nextQuestion();else askCurrent();}
 else pause();
});
$('replay').addEventListener('click',()=>{if(state.question&&!state.resolved&&state.phase!=='paused')askCurrent();});
$('answer-form').addEventListener('submit',e=>{e.preventDefault();submitAnswer(parseAnswer($('answer').value));});
$('answer').addEventListener('input',()=>{$('answer').value=$('answer').value.replace(/[^0-9]/g,'').slice(0,3);});
$('keypad').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.digit!==undefined)$('answer').value=($('answer').value+button.dataset.digit).slice(0,3);
 else if(button.id==='clear')$('answer').value='';else if(button.id==='backspace')$('answer').value=$('answer').value.slice(0,-1);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!['idle','paused'].includes(state.phase))pause();});
window.addEventListener('pagehide',cancelPending);
render();
