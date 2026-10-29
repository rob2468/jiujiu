export function parseAnswer(raw) {
  if (/[0-9０-９][.,，．][0-9０-９]/.test(String(raw ?? ''))) return null;
  let s = String(raw ?? '').trim().toLowerCase().replace(/[，。！？,.!?、\s]/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/^(我的答案是|答案是|答案|我觉得是|我认为是|应该是|等于|是)/, '')
    .replace(/(吧|呀|啊|呢|了)$/, '');
  if (/^\d{1,3}$/.test(s)) return Number(s);
  s = s.replaceAll('两', '二').replaceAll('兩', '二').replaceAll('〇', '零');
  const digits = {零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if (/^[零一二三四五六七八九]{1,3}$/.test(s)) return Number([...s].map(c => digits[c]).join(''));
  if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(s)) {
    const [a,b] = s.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0);
  }
  if (/^[一二三四五六七八九]百$/.test(s)) return digits[s[0]] * 100;
  return null;
}
export function makeDeck(random = Math.random, previous = null) {
  const deck = [];
  for(let a=1; a<=9; a++) for(let b=1; b<=9; b++) deck.push({a,b});
  for(let i=deck.length-1;i>0;i--) {const j=Math.floor(random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]];}
  if(previous && deck.at(-1).a === previous.a && deck.at(-1).b === previous.b) [deck[0],deck[80]]=[deck[80],deck[0]];
  return deck;
}
export function assess(question, answer, attempts) {
  if(!Number.isInteger(answer) || answer<0 || answer>999) return {kind:'invalid',attempts};
  if(answer === question.a*question.b) return {kind:'correct',attempts};
  const used=attempts+1;
  return {kind:used>=3?'reveal':'retry',attempts:used};
}
