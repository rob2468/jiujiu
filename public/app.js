import {parseAnswer, makeDeck, assess} from './core.js';
const $ = id => document.getElementById(id);
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;
const state = {phase:'idle', question:null, deck:[], attempts:0, round:0, correct:0, completed:0, streak:0, token:0, timers:new Set(), recognition:null, speaking:false, resolved:false, microphoneBlocked:false};
const phaseNames = {idle:'等你开始',asking:'正在读题',ready:'轮到你啦',listening:'正在听答案',feedback:'一起记住',paused:'已暂停'};
function later(fn, ms, token=state.token){const id=setTimeout(()=>{state.timers.delete(id);if(token===state.token)fn();},ms);state.timers.add(id);return id;}
function stopRecognition(){
 if(state.recognitionTimer){clearTimeout(state.recognitionTimer);state.timers.delete(state.recognitionTimer);state.recognitionTimer=null;}
 const r=state.recognition;state.recognition=null;state.audioStarted=false;
 if(r){r.onstart=r.onaudiostart=r.onspeechstart=r.onaudioend=r.onnomatch=r.onresult=r.onerror=r.onend=null;try{r.abort();}catch{}}
}
function cancelPending(){state.token++;for(const id of state.timers)clearTimeout(id);state.timers.clear();stopRecognition();state.speaking=false;if(synthesis)synthesis.cancel();}
function feedback(title, detail, type='', icon='✦'){$('feedback-title').textContent=title;$('feedback-detail').textContent=detail;$('feedback').className=`feedback ${type}`;$('feedback-icon').textContent=icon;}
function render(){
 const active=state.phase!=='idle'&&state.phase!=='paused';
 const canAnswer=['ready','listening'].includes(state.phase)&&!state.resolved;
 $('round-label').textContent=state.round?`第 ${String(state.round).padStart(2,'0')} 题`:'准备出发';
 $('phase-label').className=`phase-label ${state.phase}`;
 const phaseText=state.phase==='listening'&&!state.audioStarted?'正在连接语音':phaseNames[state.phase];
 $('phase-label').replaceChildren(Object.assign(document.createElement('i'),{}),document.createTextNode(` ${phaseText}`));
 $('question-hint').textContent=state.phase==='idle'?'今天，也来练习一下吧':state.phase==='paused'?'休息一下，准备好再继续':state.resolved?'把这道题记在心里':'想一想，等于多少？';
 $('factor-a').textContent=state.question?.a??'?';$('factor-b').textContent=state.question?.b??'?';
 $('result-value').textContent=state.resolved?state.question.a*state.question.b:'?';$('result-value').className=`result-value ${state.resolved?'revealed':''}`;
 $('start-text').textContent=state.phase==='idle'?'开始练习':state.phase==='paused'?'继续练习':'暂停一下';$('start-icon').textContent=active?'Ⅱ':'▶';
 $('replay').disabled=!state.question||!active||state.resolved||['asking','feedback'].includes(state.phase);
 $('listen').disabled=!Recognition||state.microphoneBlocked||!canAnswer;
 $('listen').className=`mic-button ${state.phase==='listening'?'active':''}`;$('listen-text').textContent=state.phase==='listening'?(state.audioStarted?'正在听…':'连接中…'):'说答案';
 $('listen').setAttribute('aria-label',state.phase==='listening'?'停止听答案':'用麦克风回答');
 $('answer').disabled=!canAnswer;$('submit').disabled=!canAnswer;
 document.querySelectorAll('#keypad button').forEach(b=>b.disabled=!canAnswer);
 const left=3-state.attempts;$('attempt-count').textContent=`${left} 次`;$('chances').setAttribute('aria-label',`剩余${left}次机会`);
 [...$('chances').children].forEach((c,i)=>c.className=i<left?'':'used');
 $('correct-count').textContent=state.correct;$('completed-count').textContent=state.completed;$('streak-count').textContent=state.streak;
 $('progress-note').textContent=state.completed?`已经完成 ${state.completed} 道题${state.streak>=3?`，连续答对 ${state.streak} 题，太棒了！`:'，每一次思考都算数。'}`:'从第一道题开始，慢慢来。';
}
function say(text, done, token=state.token){
 stopRecognition();
 if(!synthesis||!window.SpeechSynthesisUtterance){later(done,220,token);return;}
 state.speaking=true;
 const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=.88;utterance.pitch=1.05;
 const voices=synthesis.getVoices();const voice=voices.find(v=>/^zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;
 let finished=false;
 const finish=()=>{if(finished||token!==state.token)return;finished=true;state.speaking=false;later(done,450,token);};
 utterance.onend=finish;utterance.onerror=finish;
 later(()=>{if(!finished){synthesis.cancel();finish();}},Math.min(20000,4000+text.length*300),token);
 try{synthesis.speak(utterance);}catch{finish();}
}
function ready(){
 if(state.phase==='paused'||state.resolved)return;
 state.phase='ready';render();
 if($('auto-voice').checked&&Recognition&&!state.microphoneBlocked)listen();
 else feedback('轮到你啦',Recognition?'说出答案，或用数字键盘输入。':'用数字键盘输入答案，再点击“提交”。');
}
function askCurrent(){
 cancelPending();state.phase='asking';$('answer').value='';feedback('先听题目，再说答案','读题时麦克风会关闭，避免把题目当成答案。');render();
 say(`${state.question.a}乘以${state.question.b}等于多少？`,ready);
}
function nextQuestion(){
 if(state.phase==='paused')return;
 if(!state.deck.length)state.deck=makeDeck(Math.random,state.question);
 state.question=state.deck.pop();state.attempts=0;state.resolved=false;state.round++;askCurrent();
}
function listen(){
 if(!Recognition||state.microphoneBlocked||!['ready','listening'].includes(state.phase)||state.speaking||state.resolved)return;
 if(state.phase==='listening'){stopRecognition();state.phase='ready';feedback('麦克风已关闭','可以点击“说答案”重试，或者输入数字。');render();return;}
 stopRecognition();const token=state.token;let gotResult=false;let failed=false;
 let recognition;
 try{recognition=new Recognition();}catch{feedback('这次没能打开语音','请使用数字键盘继续，不会扣除机会。');return;}
 state.recognition=recognition;recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
 const current=()=>token===state.token&&state.recognition===recognition;
 const finishWithoutAnswer=(title,detail)=>{
   if(!current())return;
   stopRecognition();state.phase='ready';feedback(title,detail);render();
 };
 const deadline=(ms,title,detail)=>{
   if(state.recognitionTimer){clearTimeout(state.recognitionTimer);state.timers.delete(state.recognitionTimer);}
   state.recognitionTimer=later(()=>finishWithoutAnswer(title,detail),ms,token);
 };
 state.phase='listening';feedback('正在连接麦克风','如浏览器弹出权限请求，请允许；看到“请说出答案”后再开口。');render();
 deadline(15000,'语音没有启动','点击“说答案”手动重试，或使用数字键盘。这次不扣机会。');
 recognition.onstart=()=>{if(token!==state.token||state.recognition!==recognition){try{recognition.abort();}catch{}}};
 recognition.onaudiostart=()=>{
   if(!current())return;
   state.audioStarted=true;render();
   feedback('请说出答案','麦克风已启动，比如说“二十四”。','', '♪');
   deadline(20000,'没有收到识别结果','点击“说答案”重试；若反复出现，请换浏览器或用数字键盘。这次不扣机会。');
 };
 recognition.onspeechstart=()=>{if(current())feedback('检测到说话声','正在识别，请稍等。','', '♪');};
 recognition.onaudioend=()=>{
   if(!current())return;
   feedback('正在等待识别结果','麦克风已停止收音，请稍等。');
   deadline(10000,'语音识别服务没有响应','页面已停止等待。请重试或使用数字键盘，这次不扣机会。');
 };
 recognition.onnomatch=()=>finishWithoutAnswer('没有识别出答案','点击“说答案”再试一次，或使用数字键盘。这次不扣机会。');
 recognition.onresult=event=>{
   if(token!==state.token||state.recognition!==recognition||state.speaking||state.phase!=='listening')return;
   const result=event.results[event.resultIndex??0];if(!result)return;
   if(!result.isFinal){feedback('正在识别你的答案',`听到“${(result[0]?.transcript??'').slice(0,45)}”，等待确认。`);return;}
   gotResult=true;const transcript=result[0]?.transcript??'';const answer=parseAnswer(transcript);
   stopRecognition();state.phase='ready';render();
   if(answer===null){feedback('没听清数字，再说一次吧',`听到“${transcript.slice(0,45)}”。这次不扣机会，也可以输入数字。`);return;}
   $('answer').value=String(answer);submitAnswer(answer,transcript);
 };
 recognition.onerror=event=>{
   if(token!==state.token||state.recognition!==recognition)return;
   failed=true;stopRecognition();state.phase='ready';
   if(event.error==='not-allowed'){
     state.microphoneBlocked=true;$('auto-voice').checked=false;
     $('support-note').textContent='麦克风未获允许。请在浏览器的网站权限中开启麦克风后刷新页面；现在可以用数字键盘继续。';
     feedback('用数字键盘，也可以练习','麦克风权限未开启。这次不扣机会。');
   }else if(event.error==='service-not-allowed'){
     $('auto-voice').checked=false;
     feedback('浏览器不允许使用语音识别服务','请在浏览器设置中检查语音权限，或换浏览器打开。这次不扣机会。');
   }else if(event.error==='network'){
     $('auto-voice').checked=false;
     feedback('连接不上语音识别服务','网页能打开不代表语音服务可用。请检查网络，或用数字键盘继续。这次不扣机会。');
   }else if(event.error==='language-not-supported'){
     $('auto-voice').checked=false;
     feedback('当前语音服务不支持中文','请换支持中文识别的浏览器，或用数字键盘继续。这次不扣机会。');
   }else if(event.error==='audio-capture'){
     feedback('没有检测到可用的麦克风','请检查设备，或使用数字键盘。这次不扣机会。');
   }else if(event.error==='no-speech'){
     feedback('没有听到答案，不着急','点击“说答案”再试一次。这次不扣机会。');
   }else if(event.error!=='aborted'){
     feedback('语音暂时没有连上','请检查网络或用数字键盘继续。这次不扣机会。');
   }
   render();
 };
 recognition.onend=()=>{
   if(token!==state.token||state.recognition!==recognition)return;
   stopRecognition();
   if(!gotResult&&!failed&&state.phase==='listening'){state.phase='ready';feedback('没有听清，机会还在','点击“说答案”再试一次，或者输入答案。');render();}
 };
 try{recognition.start();}catch{
   stopRecognition();state.phase='ready';feedback('请再点一次“说答案”','浏览器没有启动语音。也可以用数字键盘作答。');render();
 }
}
function celebrate(){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const box=$('confetti');box.replaceChildren();
 for(let i=0;i<24;i++){const bit=document.createElement('i');bit.style.left=`${20+Math.random()*60}%`;bit.style.background=['#e7bc74','#87ad7f','#df9d7c','#ccd5a0'][i%4];bit.style.animationDelay=`${Math.random()*.15}s`;bit.style.setProperty('--drift',`${(Math.random()-.5)*300}px`);box.append(bit);}
 later(()=>box.replaceChildren(),2000);
}
function submitAnswer(answer,transcript=null){
 if(!['ready','listening'].includes(state.phase)||state.resolved)return;
 const outcome=assess(state.question,answer,state.attempts);
 if(outcome.kind==='invalid'){feedback('请输入一个数字','语音没听清或输入无效，都不会扣机会。');return;}
 cancelPending();state.attempts=outcome.attempts;state.phase='feedback';
 const heard=transcript?`听到“${transcript.slice(0,45)}”。`:'';
 if(outcome.kind==='correct'){
   state.resolved=true;state.correct++;state.completed++;state.streak++;
   feedback('答对啦，真棒！',`${heard}${state.question.a} × ${state.question.b} = ${answer}，准备下一题。`,'success','✓');render();celebrate();
   say('恭喜你，答对啦！',()=>later(nextQuestion,900));
 }else if(outcome.kind==='retry'){
   feedback('差一点，再想一想',`${heard}${answer} 还不是答案。还有 ${3-state.attempts} 次机会。`,'retry','↻');render();
   say(`还不对哦，再想一想。你还有${3-state.attempts}次机会。`,()=>{state.phase='ready';$('answer').value='';render();if($('auto-voice').checked&&Recognition&&!state.microphoneBlocked)listen();});
 }else{
   state.resolved=true;state.completed++;state.streak=0;
   feedback('没关系，一起记住答案',`${state.question.a} × ${state.question.b} = ${state.question.a*state.question.b}。停一停，再出发。`,'reveal','♡');render();
   say(`没关系，正确答案是${state.question.a*state.question.b}。${state.question.a}乘以${state.question.b}等于${state.question.a*state.question.b}。我们继续下一题。`,()=>later(nextQuestion,2000));
 }
}
function pause(){cancelPending();state.phase='paused';feedback('休息一下，也很好','麦克风和朗读已停止。点击“继续练习”接着来。');render();}
$('start').addEventListener('click',()=>{
 if(state.phase==='idle'){nextQuestion();}
 else if(state.phase==='paused'){state.phase='ready';if(state.resolved)nextQuestion();else askCurrent();}
 else pause();
});
$('replay').addEventListener('click',()=>{if(state.question&&!state.resolved&&state.phase!=='paused')askCurrent();});
$('listen').addEventListener('click',listen);
$('answer-form').addEventListener('submit',e=>{e.preventDefault();submitAnswer(parseAnswer($('answer').value));});
$('answer').addEventListener('input',()=>{if(state.phase==='listening'){stopRecognition();state.phase='ready';render();} $('answer').value=$('answer').value.replace(/[^0-9]/g,'').slice(0,3);});
$('keypad').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;if(state.phase==='listening'){stopRecognition();state.phase='ready';render();}
 if(button.dataset.digit!==undefined)$('answer').value=($('answer').value+button.dataset.digit).slice(0,3);
 else if(button.id==='clear')$('answer').value='';else if(button.id==='backspace')$('answer').value=$('answer').value.slice(0,-1);
});
$('auto-voice').addEventListener('change',()=>{
 if(!$('auto-voice').checked&&state.phase==='listening'){stopRecognition();state.phase='ready';feedback('自动听答案已关闭','可以使用数字键盘，或点“说答案”单次开启。');render();}
 else if($('auto-voice').checked&&state.phase==='ready')listen();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!['idle','paused'].includes(state.phase))pause();});
window.addEventListener('pagehide',cancelPending);
if(!Recognition){$('auto-voice').checked=false;$('auto-voice').disabled=true;$('support-note').textContent='这个浏览器暂不支持语音识别。朗读与数字键盘仍可使用；也可尝试在支持语音的浏览器中打开。';}
if(!synthesis)$('support-note').textContent+=' 当前浏览器也不支持自动朗读，请看题作答。';
render();
