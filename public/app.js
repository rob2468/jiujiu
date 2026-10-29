import {parseAnswer, makeDeck, assess} from './core.js';
const $ = id => document.getElementById(id);
const synthesis = window.speechSynthesis;
const state = {phase:'idle', question:null, deck:[], attempts:0, round:0, correct:0, completed:0, streak:0, resolved:false};
const phaseNames = {idle:'等你开始',ready:'随时可以作答',paused:'已暂停'};
function stopSpeech(){try{synthesis?.cancel();}catch{}}
function feedback(title, detail, type=''){$('feedback-title').textContent=title;$('feedback-detail').textContent=detail;$('feedback').className=`feedback ${type}`;}
function render(){
 const active=state.phase!=='idle'&&state.phase!=='paused';
 const canAnswer=state.phase==='ready'&&!state.resolved;
 $('round-label').textContent=state.round?`第 ${String(state.round).padStart(2,'0')} 题`:'准备出发';
 $('phase-label').className=`phase-label ${state.phase}`;
 $('phase-label').textContent=active&&state.resolved?'查看答案':phaseNames[state.phase];
 $('question-hint').textContent=state.phase==='idle'?'点击开始练习':state.phase==='paused'?'练习已暂停':state.resolved?'正确答案':'等于多少？';
 $('factor-a').textContent=state.question?.a??'?';$('factor-b').textContent=state.question?.b??'?';
 $('result-value').textContent=state.resolved?state.question.a*state.question.b:'?';$('result-value').className=`result-value ${state.resolved?'revealed':''}`;
 $('start-text').textContent=state.phase==='idle'?'开始练习':state.phase==='paused'?'继续练习':'暂停一下';$('start-icon').textContent=active?'Ⅱ':'▶';
 $('replay').disabled=!state.question||!active||!synthesis||!window.SpeechSynthesisUtterance;
 $('answer').disabled=!canAnswer;$('submit').disabled=!active;
 $('submit').textContent=state.resolved?'下一题':'提交';
 document.querySelectorAll('#keypad button').forEach(b=>b.disabled=!canAnswer);
 const left=3-state.attempts;$('attempt-count').textContent=`${left} 次`;$('chances').setAttribute('aria-label',`剩余${left}次机会`);
 [...$('chances').children].forEach((c,i)=>c.className=i<left?'':'used');
 $('correct-count').textContent=state.correct;$('completed-count').textContent=state.completed;$('streak-count').textContent=state.streak;
}
function say(text){
 stopSpeech();
 if(!synthesis||!window.SpeechSynthesisUtterance)return;
 // Speech never advances questions or changes input availability.
 try{
   const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=.88;utterance.pitch=1.05;
   const voices=synthesis.getVoices();const voice=voices.find(v=>/^zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;
   synthesis.speak(utterance);
 }catch{}
}
function askCurrent(){
 state.phase='ready';feedback('请输入答案','不用等朗读，输入后即可提交。');render();
 say(`${state.question.a}乘以${state.question.b}等于多少？`);
}
function nextQuestion(){
 if(state.phase==='paused')return;
 if(!state.deck.length)state.deck=makeDeck(Math.random,state.question);
 state.question=state.deck.pop();state.attempts=0;state.resolved=false;state.round++;$('answer').value='';askCurrent();
}
function submitAnswer(answer){
 if(state.phase!=='ready'||state.resolved)return;
 stopSpeech();
 const outcome=assess(state.question,answer,state.attempts);
 if(outcome.kind==='invalid'){feedback('请输入一个数字','输入无效，不会扣除机会。');return;}
 state.attempts=outcome.attempts;
 if(outcome.kind==='correct'){
   const previous=`${state.question.a} × ${state.question.b} = ${answer}`;
   state.correct++;state.completed++;state.streak++;
   nextQuestion();
   feedback('上一题答对了',`${previous}。继续作答。`,'success');
 }else if(outcome.kind==='retry'){
   $('answer').value='';
   feedback('再试一次',`${answer} 还不是答案。还有 ${3-state.attempts} 次机会。`,'retry');render();
   say(`还不对，你还有${3-state.attempts}次机会。`);
 }else{
   state.resolved=true;state.completed++;state.streak=0;
   $('answer').value='';
   feedback('正确答案',`${state.question.a} × ${state.question.b} = ${state.question.a*state.question.b}。点击“下一题”继续。`,'reveal');render();
   say(`正确答案是${state.question.a*state.question.b}。`);
 }
}
function pause(){stopSpeech();state.phase='paused';feedback('已暂停','点击“继续练习”接着来。');render();}
$('start').addEventListener('click',()=>{
 if(state.phase==='idle'){nextQuestion();}
 else if(state.phase==='paused'){state.phase='ready';if(state.resolved)nextQuestion();else askCurrent();}
 else pause();
});
$('replay').addEventListener('click',()=>{
 if(state.phase==='ready'&&state.question)say(state.resolved?`正确答案是${state.question.a*state.question.b}。`:`${state.question.a}乘以${state.question.b}等于多少？`);
});
$('answer-form').addEventListener('submit',e=>{
 e.preventDefault();
 if(state.phase!=='ready')return;
 if(state.resolved){nextQuestion();return;}
 submitAnswer(parseAnswer($('answer').value));
});
$('answer').addEventListener('input',()=>{stopSpeech();$('answer').value=$('answer').value.replace(/[^0-9]/g,'').slice(0,3);});
$('keypad').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;
 stopSpeech();
 if(button.dataset.digit!==undefined)$('answer').value=($('answer').value+button.dataset.digit).slice(0,3);
 else if(button.id==='clear')$('answer').value='';else if(button.id==='backspace')$('answer').value=$('answer').value.slice(0,-1);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!['idle','paused'].includes(state.phase))pause();});
window.addEventListener('pagehide',stopSpeech);
render();
