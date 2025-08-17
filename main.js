
// ====== グローバルエラーハンドラ（原因を画面表示） ======
(function(){
  function showPanic(msg){
    try{
      var el=document.getElementById('panic');
      var pre=document.getElementById('panicMsg');
      if(el && pre){
        pre.textContent=String(msg||'Unknown error');
        el.style.display='flex';
        var c=document.getElementById('panicClose'); if(c) c.onclick=()=>{el.style.display='none'};
        var r=document.getElementById('panicReload'); if(r) r.onclick=()=>{location.reload()};
      } else {
        alert('[エラー]\\n'+msg);
      }
    }catch(e){ alert('[重大なエラー] '+(e&&e.message)); }
  }
  window.__showPanic = showPanic;
  window.addEventListener('error', function(e){
    if(!e) return;
    const detail = (e.message||'') + '\\n' + (e.filename? (e.filename+':'+e.lineno+':'+e.colno): '');
    showPanic(detail);
  });
  window.addEventListener('unhandledrejection', function(e){
    const reason = e && (e.reason && (e.reason.stack||e.reason.message) || e.reason) || '(no reason)';
    showPanic('Promise rejection: '+reason);
  });
})();


// ====== 安全なストレージ（Safari プライベート等で localStorage が例外を投げる問題を回避） ======
const Storage = (()=>{
  let ok = true;
  try{
    const k='__mc_test__'+Math.random().toString(36).slice(2);
    window.Storage.set(k,'1');
    window.Storage.remove(k);
  }catch(e){ ok = false; console.warn('[Storage] localStorage unavailable, falling back to memory', e); }
  const mem = new Map();
  return {
    ok: ()=>ok,
    get:(k)=>{ try{ return ok? window.Storage.get(k) : (mem.has(k)? mem.get(k): null); }catch(e){ return null; } },
    set:(k,v)=>{ try{ ok? window.Storage.set(k,v) : mem.set(k,v); }catch(e){ /* ignore */ } },
    remove:(k)=>{ try{ ok? window.Storage.remove(k) : mem.delete(k); }catch(e){ /* ignore */ } }
  };
})();

// ====== 数字整形（日本語単位/国際単位） ======
const NUMFMT = { mode: 'jp' };
function fmtJP(n){
  if(!isFinite(n)) return '∞';
  const neg = n<0; n=Math.abs(n);
  const units = [['京',1e16],['兆',1e12],['億',1e8],['万',1e4]];
  for(const [label, val] of units){
    if(n >= val){ const num = n/val; return (neg?'-':'') + (num<10?num.toFixed(2):num<100?num.toFixed(1):num.toFixed(0)) + label; }
  }
  return (neg?'-':'') + (n%1?n.toFixed(1):n.toFixed(0));
}
function fmtSI(n){
  if(!isFinite(n)) return '∞';
  const neg = n<0; n=Math.abs(n);
  const units=['','K','M','B','T','aa','ab','ac','ad','ae'];
  let u=0; while(n>=1000 && u<units.length-1){n/=1000;u++}
  const base = (n<10?2:n<100?1:0);
  return (neg?'-':'') + n.toFixed(base) + units[u];
}
function fmt(n){ return NUMFMT.mode==='jp'? fmtJP(n) : fmtSI(n); }

// ====== サウンド ======
const SFX = (()=>{
  let ctx = null; try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  let enabled = true;
  const setEnabled = v=>enabled=v;
  function beep({freq=440,dur=0.08,type='sine',vol=0.15,attack=0.005,release=0.05}){
    if(!enabled || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,t+attack+dur+release);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t+attack+dur+release+0.02);
  }
  function coin(){beep({freq:720,type:'triangle'})}
  function hit(){beep({freq:240,type:'square',dur:0.04})}
  function crit(){beep({freq:960,type:'sawtooth',dur:0.06,vol:0.2})}
  function buy(){beep({freq:520,type:'sawtooth',dur:0.07})}
  function error(){beep({freq:120,type:'square',dur:0.1,vol:0.2})}
  function rebirth(){beep({freq:880,dur:0.05}); setTimeout(()=>beep({freq:660,dur:0.06}),60); setTimeout(()=>beep({freq:520,dur:0.08}),130)}
  return {setEnabled,coin,hit,crit,buy,error,rebirth}
})();

// ====== ユーティリティ ======
function isBossFloor(level){ return level>0 && level%10===0; }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }

// ====== ゲーム状態 ======
const SAVE_KEY = 'monster_clicker_v4_achv_units_collection_ja';
const state = {
  version: 6,
  coins:0,
  rebirthCoins:0,
  rebirths:0,
  prestige:{permAdv:0, permMer:0, permThi:0, costAdv:1, costMer:1, costThi:1},
  // プレイヤークリック（コスト緩和版）
  player:{level:1, dmg:1, cost:5, costMul:1.07, critRate:0.05, critMult:2.0},
  // 既存
  adv:{count:0, level:0, dmg:5, hireCost:50, upCost:40, hireMul:1.15, upMul:1.15, timer:0},
  mer:{count:0, level:0, cps:1, hireCost:50, upCost:40, hireMul:1.15, upMul:1.20, timer:0},
  thi:{count:0, level:0, dmg:0.5, hireCost:50, upCost:40, hireMul:1.15, upMul:1.15, timer:0, interval:0.2},
  // 新ユニット
  bard:{count:0, level:0, hireCost:80, upCost:60, hireMul:1.15, upMul:1.18, timer:0, interval:3},
  pal:{count:0, level:0, hireCost:150, upCost:90, hireMul:1.16, upMul:1.20, timer:0, auraTimer:0, bossTimeAdded:0},
  alc:{count:0, level:0, hireCost:100, upCost:80, hireMul:1.15, upMul:1.18, timer:0},
  nin:{count:0, level:0, hireCost:180, upCost:120, hireMul:1.18, upMul:1.22, timer:0, interval:0.1, base:0.35},
  nec:{count:0, level:0, hireCost:200, upCost:140, hireMul:1.18, upMul:1.22, timer:0, summons:[]},
  mon:{count:0, level:0, hireCost:90, upCost:70, hireMul:1.15, upMul:1.18},
  // モンスター
  monster:{level:1, hp:8, maxHp:8, name:'スライム'},
  highestLevelThisRun:1,
  sound:true,
  buyQty:1,
  lastSaved: Date.now(),
  // クリコンボ
  combo:{value:1, max:2.0, gain:0.1, decayPerSec:0.4},
  // ラン統計
  run:{startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1, bossKills:0, artifacts:0, bestDps:0, bestCps:0},
  // ボス
  boss:{active:false, timeLeft:30, timeLimit:30, hpMult:1.5, rewardMult:2},
  // アーティファクト（恒久）
  artifacts:{list:[], pity:0, bonus:{crit:0, dmg:0, coin:0}},
  // チャレンジ
  challenge:{selected:'', active:'', completed:[], bonusStack:0},
  // 実績/称号（恒久）
  achv:{unlocked:[], titles:{}, selectedTitle:''},
  // バフ
  buffs:{dpsAdd:0, effects:[]},
  // UI
  ui:{logCollapsed:true},
};

let IS_RESETTING = false;
let saveIntervalId = null;
let LAST_OFFLINE = {coinsFromCps:0, coinsFromKills:0, kills:0};

// ====== 実績定義 ======
const ACHIEVEMENTS = [
  {id:'first_blood', name:'ファーストブラッド', desc:'初めて討伐する', check: s=>s.run.kills>=1, title:'若き狩人'},
  {id:'boss1', name:'王を討つ者', desc:'最初のボスを討伐', check: s=>s.run.bossKills>=1, title:'ボスキラー'},
  {id:'combo_25', name:'しなやかな連撃', desc:'最大コンボ 2.5 以上', check: s=>s.run.maxCombo>=2.5, title:'コンボ名人'},
  {id:'art5', name:'コレクター', desc:'アーティファクト5個所持', check: s=> (s.artifacts.list?.length||0)>=5, title:'蒐集家'},
  {id:'rich', name:'富豪見習い', desc:'1ランで1e5コイン獲得', check: s=>s.run.coinsEarned>=1e5, title:'金貨王'},
  {id:'rebirth1', name:'新たなる旅路', desc:'初めて転生する', check: s=>s.rebirths>=1, title:'転生者'},
  {id:'chal_nom', name:'素手の商魂', desc:'チャレンジ「商人禁止」を達成', check: s=>s.challenge.completed?.includes('noMer'), title:'粗削りの勇者'},
];
function tryUnlockAchievements(){
  for(const a of ACHIEVEMENTS){
    if(state.achv.unlocked.includes(a.id)) continue;
    if(a.check(state)){ state.achv.unlocked.push(a.id); state.achv.titles[a.id]=a.title; log(`実績「${a.name}」達成！称号「${a.title}」解放`, 'crit'); }
  }
}

// ====== 互換ロード ======
function migrateOldSave(obj){
  try{
    if(!obj) return;
    if(obj.player){
      obj.player.costMul = 1.07;
      if((obj.player.level|0)<=1 && obj.player.cost>5){ obj.player.cost = 5; }
    }
    if(!obj.buffs) obj.buffs = {dpsAdd:0, effects:[]};
    if(!obj.achv) obj.achv = {unlocked:[], titles:{}, selectedTitle:''};
    if(obj.adv && typeof obj.adv.hired==='boolean'){ obj.adv.count = obj.adv.hired?1:0; delete obj.adv.hired; }
    if(obj.mer && typeof obj.mer.hired==='boolean'){ obj.mer.count = obj.mer.hired?1:0; delete obj.mer.hired; }
    if(obj.thi && typeof obj.thi.hired==='boolean'){ obj.thi.count = obj.thi.hired?1:0; delete obj.thi.hired; if(obj.thi.interval==null) obj.thi.interval=0.2; }
  }catch(e){ console.warn('migrate error', e); }
}

// ====== DOM ======
const DOM = {
  coins:document.getElementById('coins'),
  rebirthCoins:document.getElementById('rebirthCoins'),
  bonus:document.getElementById('bonus'),
  comboView:document.getElementById('comboView'),
  totalDps:document.getElementById('totalDps'), totalCps:document.getElementById('totalCps'),
  artifactCount:document.getElementById('artifactCount'),
  monsterLevel:document.getElementById('monsterLevel'),
  monsterName:document.getElementById('monsterName'),
  hpFill:document.getElementById('hpFill'),
  hpNum:document.getElementById('hpNum'),
  reward:document.getElementById('reward'),
  attackBtn:document.getElementById('attackBtn'),
  monster:document.getElementById('monster'),
  monsterBox:document.getElementById('monsterBox'),
  floaters:document.getElementById('floaters'),
  battlelog:document.getElementById('battlelog'),
  toggleLog:document.getElementById('toggleLog'),
  rebirthBtn:document.getElementById('rebirthBtn'),
  previewRebirth:document.getElementById('previewRebirth'),
  bossWrap:document.getElementById('bossWrap'),
  bossTimeFill:document.getElementById('bossTimeFill'),
  bossTime:document.getElementById('bossTime'),
  // tabs
  tabShop:document.getElementById('tabShop'), tabRebirth:document.getElementById('tabRebirth'), tabCollection:document.getElementById('tabCollection'),
  panelShop:document.getElementById('panelShop'), panelRebirth:document.getElementById('panelRebirth'), panelCollection:document.getElementById('panelCollection'),
  // click
  clickLv:document.getElementById('clickLv'), clickDmg:document.getElementById('clickDmg'), clickCost:document.getElementById('clickCost'), clickBulk:document.getElementById('clickBulk'), buyClick:document.getElementById('buyClick'),
  // adv
  advStatus:document.getElementById('advStatus'), advDmg:document.getElementById('advDmg'), advLv:document.getElementById('advLv'), advCount:document.getElementById('advCount'), advDps:document.getElementById('advDps'), advHireCost:document.getElementById('advHireCost'), advHireBulk:document.getElementById('advHireBulk'), advUpCost:document.getElementById('advUpCost'), advUpBulk:document.getElementById('advUpBulk'), hireAdv:document.getElementById('hireAdv'), upAdv:document.getElementById('upAdv'),
  // mer
  merStatus:document.getElementById('merStatus'), merCps:document.getElementById('merCps'), merLv:document.getElementById('merLv'), merCount:document.getElementById('merCount'), merTotalCps:document.getElementById('merTotalCps'), merHireCost:document.getElementById('merHireCost'), merHireBulk:document.getElementById('merHireBulk'), merUpCost:document.getElementById('merUpCost'), merUpBulk:document.getElementById('merUpBulk'), hireMer:document.getElementById('hireMer'), upMer:document.getElementById('upMer'),
  // thi
  thiStatus:document.getElementById('thiStatus'), thiDmg:document.getElementById('thiDmg'), thiLv:document.getElementById('thiLv'), thiCount:document.getElementById('thiCount'), thiDps:document.getElementById('thiDps'), thiHireCost:document.getElementById('thiHireCost'), thiHireBulk:document.getElementById('thiHireBulk'), thiUpCost:document.getElementById('thiUpCost'), thiUpBulk:document.getElementById('thiUpBulk'), hireThi:document.getElementById('hireThi'), upThi:document.getElementById('upThi'),
  // new units
  bardStatus:document.getElementById('bardStatus'), bardHireCost:document.getElementById('bardHireCost'), bardUpCost:document.getElementById('bardUpCost'), bardHireBulk:document.getElementById('bardHireBulk'), bardUpBulk:document.getElementById('bardUpBulk'), hireBard:document.getElementById('hireBard'), upBard:document.getElementById('upBard'),
  palStatus:document.getElementById('palStatus'), palHireCost:document.getElementById('palHireCost'), palUpCost:document.getElementById('palUpCost'), palHireBulk:document.getElementById('palHireBulk'), palUpBulk:document.getElementById('palUpBulk'), hirePal:document.getElementById('hirePal'), upPal:document.getElementById('upPal'),
  alcStatus:document.getElementById('alcStatus'), alcHireCost:document.getElementById('alcHireCost'), alcUpCost:document.getElementById('alcUpCost'), alcHireBulk:document.getElementById('alcHireBulk'), alcUpBulk:document.getElementById('alcUpBulk'), hireAlc:document.getElementById('hireAlc'), upAlc:document.getElementById('upAlc'),
  ninStatus:document.getElementById('ninStatus'), ninHireCost:document.getElementById('ninHireCost'), ninUpCost:document.getElementById('ninUpCost'), ninHireBulk:document.getElementById('ninHireBulk'), ninUpBulk:document.getElementById('ninUpBulk'), hireNin:document.getElementById('hireNin'), upNin:document.getElementById('upNin'),
  necStatus:document.getElementById('necStatus'), necHireCost:document.getElementById('necHireCost'), necUpCost:document.getElementById('necUpCost'), necHireBulk:document.getElementById('necHireBulk'), necUpBulk:document.getElementById('necUpBulk'), hireNec:document.getElementById('hireNec'), upNec:document.getElementById('upNec'),
  monStatus:document.getElementById('monStatus'), monHireCost:document.getElementById('monHireCost'), monUpCost:document.getElementById('monUpCost'), monHireBulk:document.getElementById('monHireBulk'), monUpBulk:document.getElementById('monUpBulk'), hireMon:document.getElementById('hireMon'), upMon:document.getElementById('upMon'),
  // prestige panel
  permAdvCost:document.getElementById('permAdvCost'), permMerCost:document.getElementById('permMerCost'), permThiCost:document.getElementById('permThiCost'),
  permAdvOwned:document.getElementById('permAdvOwned'), permMerOwned:document.getElementById('permMerOwned'), permThiOwned:document.getElementById('permThiOwned'),
  buyPermAdv:document.getElementById('buyPermAdv'), buyPermMer:document.getElementById('buyPermMer'), buyPermThi:document.getElementById('buyPermThi'),
  saveHint:document.getElementById('saveHint'),
  soundToggle:document.getElementById('soundToggle'),
  qty1:document.getElementById('qty1'), qty10:document.getElementById('qty10'), qty100:document.getElementById('qty100'), qtyMax:document.getElementById('qtyMax'),
  fmtJP:document.getElementById('fmtJP'), fmtSI:document.getElementById('fmtSI'), fmtLabel:document.getElementById('fmtLabel'),
  // artifacts & challenge UI
  artCount:document.getElementById('artCount'), artCrit:document.getElementById('artCrit'), artDmg:document.getElementById('artDmg'), artCoin:document.getElementById('artCoin'),
  challengeList:document.getElementById('challengeList'), challengeStatus:document.getElementById('challengeStatus'),
  resultModal:document.getElementById('resultModal'), resultBody:document.getElementById('resultBody'), closeResult:document.getElementById('closeResult'),
  // collection tab
  playerTitle:document.getElementById('playerTitle'), titleSelect:document.getElementById('titleSelect'),
  colArtCount:document.getElementById('colArtCount'), colArtCrit:document.getElementById('colArtCrit'), colArtDmg:document.getElementById('colArtDmg'), colArtCoin:document.getElementById('colArtCoin'),
  artifactList:document.getElementById('artifactList'),
  colPermAdv:document.getElementById('colPermAdv'), colPermMer:document.getElementById('colPermMer'), colPermThi:document.getElementById('colPermThi'),
  colChalDone:document.getElementById('colChalDone'), colChalBonus:document.getElementById('colChalBonus'),
  achList:document.getElementById('achList'),
};

// ====== 係数（転生/チャレンジ/アーティファクト/バフ） ======
function dmgMult(){
  const reb = Math.pow(1.1, state.rebirths);
  const chal = 1 + (state.challenge.bonusStack||0);
  const art = 1 + (state.artifacts.bonus.dmg||0);
  const bard = 1 + (state.buffs.dpsAdd||0);
  return reb * chal * art * bard;
}
function coinMultBase(){
  const reb = Math.pow(1.1, state.rebirths);
  const chal = 1 + (state.challenge.bonusStack||0);
  const art = 1 + (state.artifacts.bonus.coin||0);
  return reb * chal * art;
}
function coinMultForMerchants(){
  const alcBoost = 1 + 0.005 * (state.alc.level||0);
  return coinMultBase() * alcBoost;
}
function critRate(){ return clamp((state.player.critRate||0) + (state.artifacts.bonus.crit||0), 0, 0.6); }

// ====== モンスター/ボス ======
function updateMonsterSkin(){
  const l = state.monster.level;
  let icon='🟩', name='スライム';
  if(l>=10) {icon='🐗'; name='ボア';}
  if(l>=20) {icon='🧟'; name='ゾンビ';}
  if(l>=30) {icon='🦖'; name='リザード';}
  if(l>=40) {icon='👹'; name='オーガ';}
  if(l>=50) {icon='🐉'; name='ドラゴン';}
  if(isBossFloor(l)) name += '（王）';
  DOM.monster.textContent=icon; state.monster.name=name; DOM.monsterName.textContent=name;
}
function monsterHP(level){
  const base = Math.max(8, Math.ceil(8 * Math.pow(1.10, level-1)));
  return isBossFloor(level) ? Math.ceil(base * state.boss.hpMult) : base;
}
function monsterReward(level){
  const base = Math.max(5, Math.floor(5 * Math.pow(1.12, level-1)));
  return Math.floor(base * (isBossFloor(level)? state.boss.rewardMult : 1));
}
function enterBossIfNeeded(){
  const isBoss = isBossFloor(state.monster.level);
  state.boss.active = isBoss;
  state.boss.timeLeft = state.boss.timeLimit;
  state.pal.bossTimeAdded = 0;
  DOM.bossWrap.style.display = isBoss ? 'block' : 'none';
}

// ====== バフ ======
function tickBuffs(dt){
  let add = 0;
  const eff = [];
  for(const b of state.buffs.effects){
    b.t -= dt;
    if(b.t>0){ add += b.add; eff.push(b); }
  }
  add = Math.min(add, 0.5);
  state.buffs.dpsAdd = add;
  state.buffs.effects = eff;
}

// ====== アーティファクト ======
function recalcArtifactBonus(){
  const bonus = {crit:0, dmg:0, coin:0};
  for(const a of state.artifacts.list){
    if(a.type==='crit') bonus.crit += a.value;
    if(a.type==='dmg') bonus.dmg += a.value;
    if(a.type==='coin') bonus.coin += a.value;
  }
  state.artifacts.bonus = bonus;
}
function rollArtifactDrop(){
  const pity = state.artifacts.pity||0;
  const chance = 0.20 + (pity>=4 ? 1 : 0);
  if(Math.random() < chance){
    const t = ['crit','dmg','coin'][Math.floor(Math.random()*3)];
    const val = t==='crit' ? 0.005 : 0.01;
    state.artifacts.list.push({type:t, value:val, ts:Date.now()});
    recalcArtifactBonus();
    state.artifacts.pity = 0;
    state.run.artifacts++;
    log(`アーティファクト獲得！ (${t==='crit'?'💥クリ+0.5%':(t==='dmg'?'⚔️与ダメ+1%':'🪙獲得+1%')})`);
  } else {
    state.artifacts.pity = pity + 1;
  }
}

// ====== チャレンジ制約 ======
function challengeActive(id){ return state.challenge.active === id; }
function canUseAdv(){ return !challengeActive('thiefOnly') && !challengeActive('clickOnly'); }
function canUseThi(){ return !challengeActive('clickOnly'); }
function canUseMer(){ return !challengeActive('noMer') && !challengeActive('clickOnly'); }
function canUseSupport(){ return true; }

// ====== バトルログ ======
function spawnFloater(text, cls=''){
  const el = document.createElement('div');
  el.className='floater'+(cls?(' '+cls):'');
  el.textContent=text;
  const box = DOM.monsterBox.getBoundingClientRect();
  const x = Math.random()* (box.width-60)+30;
  const y = Math.random()* (box.height-60)+20;
  el.style.left = x+'px'; el.style.top = y+'px';
  DOM.floaters.appendChild(el);
  setTimeout(()=>el.remove(), 850);
}
function log(msg, cls=''){
  const el = document.createElement('div');
  el.className = 'logitem'+(cls?(' '+cls):'');
  const ts = new Date().toLocaleTimeString();
  el.innerHTML = `<span class="ts">[${ts}]</span>${msg}`;
  DOM.battlelog.prepend(el);
  const items = DOM.battlelog.querySelectorAll('.logitem');
  if(items.length>6) items[items.length-1].remove();
}

// ====== モンスター管理 ======
function toNextMonster(){
  state.monster.level++;
  state.highestLevelThisRun = Math.max(state.highestLevelThisRun, state.monster.level);
  state.monster.maxHp = monsterHP(state.monster.level);
  state.monster.hp = state.monster.maxHp;
  updateMonsterSkin();
  enterBossIfNeeded();
}

// ====== 通貨操作 ======
function addCoins(n){ state.coins += n; if(n>0){ state.run.coinsEarned += n; SFX.coin(); } }

// ====== ダメージ処理 ======
function dealDamage(amount, source='auto', flags={}){
  let dmg = amount * dmgMult();
  let isCrit = false;
  if(source==='click'){
    dmg *= state.combo.value;
    if(Math.random() < critRate()){
      isCrit = true; dmg *= state.player.critMult; state.run.crits++; SFX.crit();
    } else { SFX.hit(); }
    state.run.clicks++;
    state.combo.value = Math.min(state.combo.max, state.combo.value + state.combo.gain);
    state.run.maxCombo = Math.max(state.run.maxCombo, state.combo.value);
  } else if(flags.ninja){
    const extra = 0.005 * (state.nin.level||0);
    const rate = clamp(critRate() + extra, 0, 0.75);
    if(Math.random() < rate){ isCrit=true; dmg *= state.player.critMult; SFX.crit(); } else { SFX.hit(); }
  } else {
    SFX.hit();
  }
  if(flags.palBoss && state.boss.active) dmg *= 1.5;

  state.monster.hp -= dmg;
  const dmgText = (dmg%1?dmg.toFixed(1):dmg.toFixed(0));
  spawnFloater((isCrit?'CRIT ':'-') + dmgText, isCrit?'crit':'');
  if(isCrit) log(`クリティカル！ <strong>${dmgText}</strong>`, 'crit');

  if(state.monster.hp<=0){
    const baseReward = monsterReward(state.monster.level);
    let reward = Math.floor(baseReward * coinMultBase());
    const killBonus = Math.floor(baseReward * (0.01 * (state.alc.level||0)) * coinMultBase());
    reward += killBonus;
    addCoins(reward);
    state.run.kills++;
    if(isBossFloor(state.monster.level)){
      state.run.bossKills++;
      rollArtifactDrop();
    }
    if(state.nec.count>0){
      const p = 0.20 + 0.01*(state.nec.level||0);
      if(Math.random() < p){
        const dmgSk = 1 + (state.nec.level||0);
        state.nec.summons.push({time:15, tick:0.5, dmg:dmgSk, t:0});
        log(`💀 スケルトン召喚！ 15s`, 'crit');
      }
    }
    log(`Lv${state.monster.level} を討伐！ +${fmt(reward)}🪙`);
    toNextMonster();
  }
  refreshUI();
}

// ====== 新ユニット：処理 ======
function bardSong(times=1){
  if(state.bard.count<=0) return;
  const add = 0.01 * (state.bard.level||0);
  if(add<=0) return;
  for(let i=0;i<times;i++){
    state.buffs.effects.push({type:'bard', add:add, t:10});
  }
}
function paladinAttack(times=1){
  if(state.pal.count<=0) return;
  const base = 8 + 2*(state.pal.level||0);
  for(let i=0;i<times;i++) dealDamage(base * state.pal.count, 'auto', {palBoss:true});
}
function paladinTimeAura(dt){
  if(!state.boss.active || state.pal.count<=0) return;
  state.pal.auraTimer += dt;
  if(state.pal.auraTimer >= 15 && state.pal.bossTimeAdded < 5){
    const n = Math.floor(state.pal.auraTimer / 15);
    state.pal.auraTimer -= n*15;
    for(let i=0;i<n && state.pal.bossTimeAdded<5;i++){
      state.boss.timeLeft += 1;
      state.pal.bossTimeAdded += 1;
      log('🛡️ パラディンが時間+1s','');
    }
  }
}
function ninjaAttack(dt){
  if(state.nin.count<=0) return;
  state.nin.timer += dt;
  while(state.nin.timer >= state.nin.interval){
    state.nin.timer -= state.nin.interval;
    const base = (state.nin.base + 0.15*(state.nin.level||0)) * state.nin.count;
    dealDamage(base, 'auto', {ninja:true});
  }
}
function necroTick(dt){
  if(state.nec.summons.length<=0) return;
  const arr = [];
  for(const s of state.nec.summons){
    s.t += dt;
    s.time -= dt;
    while(s.t >= s.tick){ s.t -= s.tick; dealDamage(s.dmg, 'auto'); }
    if(s.time>0) arr.push(s);
  }
  state.nec.summons = arr;
}
function monkApplyMods(){
  const lv = state.mon.level||0;
  state.combo.max = 2.0 + 0.05*lv;
  const baseDecay = 0.4;
  const mult = clamp(1 - 0.05*lv, 0.25, 1);
  state.combo.decayPerSec = baseDecay * mult;
}

// ====== 購入/強化 共通 ======
function requestedQty(){ return state.buyQty==='max' ? 1000000 : (state.buyQty||1); }
function computeBulk(cost, mult, coins, maxSteps){
  let steps=0,total=0;
  for(let i=0;i<maxSteps;i++){
    const c = Math.floor(cost);
    if(coins < c) break;
    coins -= c; total += c; steps++;
    cost *= mult;
    if(steps>200000) break;
  }
  return {steps,total,nextCost:cost};
}
function sumBulk(cost, mult, steps){ let total=0; for(let i=0;i<steps;i++){ total += Math.floor(cost); cost *= mult; } return total; }
function buildBulkText(cost, mult, qty, coins){
  if(qty===1) return '';
  if(qty==='max'){
    const r = computeBulk(cost, mult, coins, 1000000);
    return r.steps>0 ? `MAX: ×${r.steps} = ${fmt(r.total)}` : 'MAX: －';
  } else {
    const need = sumBulk(cost, mult, qty);
    return `×${qty} = ${fmt(need)}`;
  }
}

// Click upgrade
function buyClick(){
  const req = requestedQty();
  const r = computeBulk(state.player.cost, state.player.costMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.player.level += r.steps;
  state.player.dmg += 1 * r.steps;
  state.player.cost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}

// Unit helpers
function hireUnit(unit){ const u=state[unit]; const req=requestedQty(); const r=computeBulk(u.hireCost,u.hireMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.count+=r.steps; u.hireCost=r.nextCost; if(unit==='mon') monkApplyMods(); SFX.buy(); refreshUI(); save(); }
function upUnit(unit, perLvInc, targetKey){ const u=state[unit]; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; state[unit][targetKey]+= perLvInc*r.steps; u.upCost=r.nextCost; if(unit==='mon') monkApplyMods(); SFX.buy(); refreshUI(); save(); }

// Existing units
function hireAdv(){ if(!canUseAdv()) return SFX.error(); hireUnit('adv'); }
function upAdv(){ if(!canUseAdv()) return SFX.error(); upUnit('adv',1,'dmg'); }
function hireMer(){ if(!canUseMer()) return SFX.error(); hireUnit('mer'); }
function upMer(){ if(!canUseMer()) return SFX.error(); upUnit('mer',1,'cps'); }
function hireThi(){ if(!canUseThi()) return SFX.error(); hireUnit('thi'); }
function upThi(){ if(!canUseThi()) return SFX.error(); upUnit('thi',0.5,'dmg'); }

// New units
function hireBard(){ if(!canUseSupport()) return SFX.error(); hireUnit('bard'); }
function upBard(){ if(!canUseSupport()) return SFX.error(); const u=state.bard; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; SFX.buy(); refreshUI(); save(); }
function hirePal(){ if(!canUseSupport()) return SFX.error(); hireUnit('pal'); }
function upPal(){ if(!canUseSupport()) return SFX.error(); const u=state.pal; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; SFX.buy(); refreshUI(); save(); }
function hireAlc(){ if(!canUseSupport()) return SFX.error(); hireUnit('alc'); }
function upAlc(){ if(!canUseSupport()) return SFX.error(); const u=state.alc; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; SFX.buy(); refreshUI(); save(); }
function hireNin(){ if(!canUseSupport()) return SFX.error(); hireUnit('nin'); }
function upNin(){ if(!canUseSupport()) return SFX.error(); const u=state.nin; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; SFX.buy(); refreshUI(); save(); }
function hireNec(){ if(!canUseSupport()) return SFX.error(); hireUnit('nec'); }
function upNec(){ if(!canUseSupport()) return SFX.error(); const u=state.nec; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; SFX.buy(); refreshUI(); save(); }
function hireMon(){ if(!canUseSupport()) return SFX.error(); hireUnit('mon'); }
function upMon(){ if(!canUseSupport()) return SFX.error(); const u=state.mon; const req=requestedQty(); const r=computeBulk(u.upCost,u.upMul,state.coins,req); if(r.steps<=0) return SFX.error(); state.coins-=r.total; u.level+=r.steps; u.upCost=r.nextCost; monkApplyMods(); SFX.buy(); refreshUI(); save(); }

// ====== 転生 ======
function previewRebirthCoins(){
  const highest = Math.max(1, state.highestLevelThisRun);
  if(highest < 50) return 0;
  return 1 + Math.floor((highest - 50) / 25);
}
function challengeDesc(id){
  return id==='noMer'?'商人禁止':id==='thiefOnly'?'盗賊のみ':id==='clickOnly'?'クリックのみ':'（なし）';
}
function completeChallengeIfAny(){
  const id = state.challenge.active;
  if(!id) return {completed:false};
  if(state.highestLevelThisRun >= 50){
    if(!state.challenge.completed.includes(id)){
      state.challenge.completed.push(id);
      state.challenge.bonusStack = 0.02 * state.challenge.completed.length;
      return {completed:true, id};
    }
  }
  return {completed:false};
}
function showResultModal(snapshot){
  const sec = Math.max(1, Math.floor((snapshot.endTs - snapshot.startTs)/1000));
  const body = `
    <div class="item"><div>最高到達Lv</div><strong>${snapshot.highest}</strong></div>
    <div class="item"><div>獲得コイン（ラン）</div><strong>${fmt(snapshot.coins)}</strong></div>
    <div class="item"><div>討伐数 / ボス</div><strong>${snapshot.kills} / ${snapshot.bossKills}</strong></div>
    <div class="item"><div>クリック / クリティカル</div><strong>${snapshot.clicks} / ${snapshot.crits}</strong></div>
    <div class="item"><div>最大コンボ</div><strong>×${snapshot.maxCombo.toFixed(2)}</strong></div>
    <div class="item"><div>ベストDPS/CPS</div><strong>${snapshot.bestDps.toFixed(1)} / ${snapshot.bestCps.toFixed(1)}</strong></div>
    <div class="item"><div>取得アーティファクト</div><strong>🧿 ${snapshot.artifacts}</strong></div>
    <div class="item"><div>プレイ時間</div><strong>${sec}s</strong></div>
    <div class="item"><div>今回の転生コイン</div><strong>✨ ${snapshot.rebirthGain}</strong></div>
    <div class="item"><div>チャレンジ</div><strong>${challengeDesc(snapshot.challengeActive)}${snapshot.challengeCompleted? '（達成！+2%恒久）':''}</strong></div>
    <div class="item"><div>累計転生</div><strong>${snapshot.rebirths}</strong></div>
  `;
  DOM.resultBody.innerHTML = body;
  const modal = DOM.resultModal; modal.style.display='flex';
  DOM.closeResult.onclick = ()=>{ modal.style.display='none'; };
}

function doRebirth(){
  if(state.monster.level < 50) return SFX.error();
  const gain = previewRebirthCoins();
  const chalRes = completeChallengeIfAny();

  const snap = {
    highest: state.highestLevelThisRun,
    coins: state.run.coinsEarned,
    kills: state.run.kills,
    bossKills: state.run.bossKills,
    clicks: state.run.clicks,
    crits: state.run.crits,
    maxCombo: state.run.maxCombo,
    bestDps: state.run.bestDps||0,
    bestCps: state.run.bestCps||0,
    artifacts: state.run.artifacts||0,
    challengeActive: state.challenge.active||'',
    challengeCompleted: chalRes.completed,
    startTs: state.run.startTs,
    endTs: Date.now(),
    rebirthGain: gain,
    rebirths: state.rebirths + 1,
  };

  if(chalRes.completed){
    log(`チャレンジ達成！ ${challengeDesc(state.challenge.active)} 恒久+2%`, 'crit');
  }

  state.rebirthCoins += gain; state.rebirths += 1; SFX.rebirth();

  // 永続雇用の適用（保有数ぶん雇用）
  const permAdv = state.prestige.permAdv|0;
  const permMer = state.prestige.permMer|0;
  const permThi = state.prestige.permThi|0;

  state.coins = 0;
  state.player = {...state.player, level:1, dmg:1, cost:5, costMul:1.07};
  state.combo.value = 1;

  // reset units
  state.adv.level = 0; state.adv.dmg = 5; state.adv.upCost = 40; state.adv.timer = 0; state.adv.count = permAdv; state.adv.hireCost = 50;
  state.mer.level = 0; state.mer.cps = 1; state.mer.upCost = 40; state.mer.timer = 0; state.mer.count = permMer; state.mer.hireCost = 50;
  state.thi.level = 0; state.thi.dmg = 0.5; state.thi.upCost = 40; state.thi.timer = 0; state.thi.count = permThi; state.thi.hireCost = 50; state.thi.interval = 0.2;
  // new units reset
  state.bard.level=0; state.bard.timer=0; state.bard.count=0; state.bard.upCost=60; state.bard.hireCost=80;
  state.pal.level=0; state.pal.timer=0; state.pal.auraTimer=0; state.pal.count=0; state.pal.upCost=90; state.pal.hireCost=150;
  state.alc.level=0; state.alc.timer=0; state.alc.count=0; state.alc.upCost=80; state.alc.hireCost=100;
  state.nin.level=0; state.nin.timer=0; state.nin.count=0; state.nin.upCost=120; state.nin.hireCost=180;
  state.nec.level=0; state.nec.timer=0; state.nec.count=0; state.nec.upCost=140; state.nec.hireCost=200; state.nec.summons=[];
  state.mon.level=0; state.mon.count=0; state.mon.upCost=70; state.mon.hireCost=90; monkApplyMods();

  // monster reset
  state.monster.level = 1; state.monster.maxHp = monsterHP(1); state.monster.hp = state.monster.maxHp;
  state.highestLevelThisRun = 1;
  state.run = {startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1, bossKills:0, artifacts:0, bestDps:0, bestCps:0};

  state.challenge.active = state.challenge.selected || '';
  state.challenge.bonusStack = 0.02 * (state.challenge.completed?.length||0);

  updateMonsterSkin();
  enterBossIfNeeded();
  applyPermBaseline();
  refreshUI();
  save();

  tryUnlockAchievements();
  showResultModal(snap);
}

// ====== 転生ショップ ======
function buyPerm(kind){
  const keyMap = {adv:'permAdv', mer:'permMer', thi:'permThi'};
  const costKey = {adv:'costAdv', mer:'costMer', thi:'costThi'};
  const key = keyMap[kind]; const ckey = costKey[kind];
  const cost = state.prestige[ckey];
  if(state.rebirthCoins < cost) return SFX.error();
  state.rebirthCoins -= cost;
  state.prestige[key] = (state.prestige[key]||0) + 1;
  applyPermBaseline();
  SFX.buy(); log(`永続雇用（${kind}）+1`);
  refreshUI(); save();
}
function applyPermBaseline(){
  if(state.adv.count < (state.prestige.permAdv|0)) state.adv.count = state.prestige.permAdv|0;
  if(state.mer.count < (state.prestige.permMer|0)) state.mer.count = state.prestige.permMer|0;
  if(state.thi.count < (state.prestige.permThi|0)) state.thi.count = state.prestige.permThi|0;
}

// ====== UI更新 ======
function updateBulkPreviews(){
  const qty = state.buyQty;
  const bulk = (cost,mul)=>buildBulkText(cost,mul,qty,state.coins);
  if(DOM.clickBulk) DOM.clickBulk.textContent = bulk(state.player.cost, state.player.costMul);
  // existing
  DOM.advHireBulk.textContent = bulk(state.adv.hireCost, state.adv.hireMul);
  DOM.advUpBulk.textContent = bulk(state.adv.upCost, state.adv.upMul);
  DOM.merHireBulk.textContent = bulk(state.mer.hireCost, state.mer.hireMul);
  DOM.merUpBulk.textContent = bulk(state.mer.upCost, state.mer.upMul);
  DOM.thiHireBulk.textContent = bulk(state.thi.hireCost, state.thi.hireMul);
  DOM.thiUpBulk.textContent = bulk(state.thi.upCost, state.thi.upMul);
  // new
  DOM.bardHireBulk.textContent = bulk(state.bard.hireCost, state.bard.hireMul);
  DOM.bardUpBulk.textContent = bulk(state.bard.upCost, state.bard.upMul);
  DOM.palHireBulk.textContent = bulk(state.pal.hireCost, state.pal.hireMul);
  DOM.palUpBulk.textContent = bulk(state.pal.upCost, state.pal.upMul);
  DOM.alcHireBulk.textContent = bulk(state.alc.hireCost, state.alc.hireMul);
  DOM.alcUpBulk.textContent = bulk(state.alc.upCost, state.alc.upMul);
  DOM.ninHireBulk.textContent = bulk(state.nin.hireCost, state.nin.hireMul);
  DOM.ninUpBulk.textContent = bulk(state.nin.upCost, state.nin.upMul);
  DOM.necHireBulk.textContent = bulk(state.nec.hireCost, state.nec.hireMul);
  DOM.necUpBulk.textContent = bulk(state.nec.upCost, state.nec.upMul);
  DOM.monHireBulk.textContent = bulk(state.mon.hireCost, state.mon.hireMul);
  DOM.monUpBulk.textContent = bulk(state.mon.upCost, state.mon.upMul);
}
function updateQtyUI(){ DOM.qty1.classList.toggle('active', state.buyQty===1); DOM.qty10.classList.toggle('active', state.buyQty===10); DOM.qty100.classList.toggle('active', state.buyQty===100); DOM.qtyMax.classList.toggle('active', state.buyQty==='max'); }
function updateFmtUI(){ DOM.fmtJP.classList.toggle('active', NUMFMT.mode==='jp'); DOM.fmtSI.classList.toggle('active', NUMFMT.mode!=='jp'); DOM.fmtLabel.textContent = NUMFMT.mode==='jp'?'万/億':'K/M'; }

function refreshCollection(){
  const N = state.artifacts.list.length;
  DOM.colArtCount.textContent = N;
  DOM.colArtCrit.textContent = '+'+Math.round((state.artifacts.bonus.crit||0)*1000)/10+'%';
  DOM.colArtDmg.textContent = '+'+Math.round((state.artifacts.bonus.dmg||0)*100)+'%';
  DOM.colArtCoin.textContent = '+'+Math.round((state.artifacts.bonus.coin||0)*100)+'%';
  // emoji list
  let html='';
  for(const a of state.artifacts.list){
    html += `<div class="art">${a.type==='crit'?'💥+0.5%':(a.type==='dmg'?'⚔️+1%':'🪙+1%')}</div>`;
  }
  DOM.artifactList.innerHTML = html || '<div class="muted">まだありません</div>';

  // Prestige & challenge
  DOM.colPermAdv.textContent = state.prestige.permAdv|0;
  DOM.colPermMer.textContent = state.prestige.permMer|0;
  DOM.colPermThi.textContent = state.prestige.permThi|0;
  DOM.colChalDone.textContent = state.challenge.completed?.length||0;
  DOM.colChalBonus.textContent = Math.round((state.challenge.bonusStack||0)*100);

  // Achievements
  const ul = new Set(state.achv.unlocked);
  const achHTML = ACHIEVEMENTS.map(a=>{
    const done = ul.has(a.id);
    return `<div class="ach ${done?'done':''}"><div>${done?'✅':'⬜️'}</div><div class="name">${a.name}</div><div class="muted">— ${a.desc}</div></div>`;
  }).join('');
  DOM.achList.innerHTML = achHTML;
  // Titles select
  const titles = [['','（なし）']].concat(ACHIEVEMENTS.filter(a=>ul.has(a.id)).map(a=>[a.id,a.title]));
  DOM.titleSelect.innerHTML = titles.map(([id,txt])=>`<option value="${id}" ${state.achv.selectedTitle===id?'selected':''}>${txt}</option>`).join('');
  const current = ACHIEVEMENTS.find(a=>a.id===state.achv.selectedTitle);
  DOM.playerTitle.textContent = current? `【${current.title}】` : '';
}

function refreshUI(){
  DOM.coins.textContent = fmt(state.coins);
  DOM.rebirthCoins.textContent = fmt(state.rebirthCoins);
  DOM.bonus.textContent = '×'+(dmgMult()).toFixed(2);
  DOM.comboView.textContent = '×'+(state.combo.value||1).toFixed(2);
  DOM.artifactCount.textContent = (state.artifacts.list?.length||0);

  if(state.boss.active){
    DOM.bossWrap.style.display='block';
    DOM.bossTime.textContent = state.boss.timeLeft.toFixed(1)+'s';
    DOM.bossTimeFill.style.width = clamp((state.boss.timeLeft/state.boss.timeLimit)*100,0,100)+'%';
  } else {
    DOM.bossWrap.style.display='none';
  }

  DOM.monsterLevel.textContent = state.monster.level;
  DOM.hpFill.style.width = Math.max(0, (state.monster.hp/state.monster.maxHp)*100)+'%';
  DOM.hpNum.textContent = `${Math.max(0,state.monster.hp).toFixed(state.monster.maxHp<100?1:0)} / ${state.monster.maxHp}`;
  DOM.reward.textContent = `討伐報酬: ${fmt(Math.floor(monsterReward(state.monster.level)*coinMultBase()))}🪙`;

  const canRebirth = state.monster.level >= 50;
  DOM.rebirthBtn.disabled = !canRebirth;
  DOM.previewRebirth.textContent = previewRebirthCoins();

  // Click
  DOM.clickLv.textContent = `Lv.${state.player.level}`;
  DOM.clickDmg.textContent = state.player.dmg.toFixed(0);
  DOM.clickCost.textContent = fmt(Math.floor(state.player.cost));
  DOM.buyClick.disabled = state.coins < Math.floor(state.player.cost);

  // Existing units
  const advPer = state.adv.dmg * dmgMult();
  const advTot = advPer * state.adv.count;
  DOM.advStatus.textContent = state.adv.count>0 ? `雇用数 ${state.adv.count}` : '未雇用';
  DOM.advDmg.textContent = advPer.toFixed(1);
  DOM.advLv.textContent = state.adv.level;
  DOM.advCount.textContent = state.adv.count;
  DOM.advDps.textContent = advTot.toFixed(1);
  DOM.advHireCost.textContent = fmt(Math.floor(state.adv.hireCost));
  DOM.advUpCost.textContent = fmt(Math.floor(state.adv.upCost));
  DOM.hireAdv.disabled = state.coins < Math.floor(state.adv.hireCost) || !canUseAdv();
  DOM.upAdv.disabled = state.coins < Math.floor(state.adv.upCost) || !canUseAdv();

  const merPer = state.mer.cps * coinMultForMerchants();
  const merTot = merPer * state.mer.count;
  DOM.merStatus.textContent = state.mer.count>0 ? `雇用数 ${state.mer.count}` : '未雇用';
  DOM.merCps.textContent = merPer.toFixed(1);
  DOM.merLv.textContent = state.mer.level;
  DOM.merCount.textContent = state.mer.count;
  DOM.merTotalCps.textContent = merTot.toFixed(1);
  DOM.merHireCost.textContent = fmt(Math.floor(state.mer.hireCost));
  DOM.merUpCost.textContent = fmt(Math.floor(state.mer.upCost));
  DOM.hireMer.disabled = state.coins < Math.floor(state.mer.hireCost) || !canUseMer();
  DOM.upMer.disabled = state.coins < Math.floor(state.mer.upCost) || !canUseMer();

  const thiPer = state.thi.dmg * dmgMult() * (1/state.thi.interval);
  const thiTot = thiPer * state.thi.count;
  DOM.thiStatus.textContent = state.thi.count>0 ? `雇用数 ${state.thi.count}` : '未雇用';
  DOM.thiDmg.textContent = (state.thi.dmg * dmgMult()).toFixed(1);
  DOM.thiLv.textContent = state.thi.level;
  DOM.thiCount.textContent = state.thi.count;
  DOM.thiDps.textContent = thiTot.toFixed(1);
  DOM.thiHireCost.textContent = fmt(Math.floor(state.thi.hireCost));
  DOM.thiUpCost.textContent = fmt(Math.floor(state.thi.upCost));
  DOM.hireThi.disabled = state.coins < Math.floor(state.thi.hireCost) || !canUseThi();
  DOM.upThi.disabled = state.coins < Math.floor(state.thi.upCost) || !canUseThi();

  // New units UI
  DOM.bardStatus.textContent = state.bard.count>0 ? `雇用数 ${state.bard.count} / Lv.${state.bard.level}` : '未雇用';
  DOM.bardHireCost.textContent = fmt(Math.floor(state.bard.hireCost));
  DOM.bardUpCost.textContent = fmt(Math.floor(state.bard.upCost));
  DOM.hireBard.disabled = state.coins < Math.floor(state.bard.hireCost);
  DOM.upBard.disabled = state.coins < Math.floor(state.bard.upCost);

  DOM.palStatus.textContent = state.pal.count>0 ? `雇用数 ${state.pal.count} / Lv.${state.pal.level}` : '未雇用';
  DOM.palHireCost.textContent = fmt(Math.floor(state.pal.hireCost));
  DOM.palUpCost.textContent = fmt(Math.floor(state.pal.upCost));
  DOM.hirePal.disabled = state.coins < Math.floor(state.pal.hireCost);
  DOM.upPal.disabled = state.coins < Math.floor(state.pal.upCost);

  DOM.alcStatus.textContent = state.alc.count>0 ? `雇用数 ${state.alc.count} / Lv.${state.alc.level}` : '未雇用';
  DOM.alcHireCost.textContent = fmt(Math.floor(state.alc.hireCost));
  DOM.alcUpCost.textContent = fmt(Math.floor(state.alc.upCost));
  DOM.hireAlc.disabled = state.coins < Math.floor(state.alc.hireCost);
  DOM.upAlc.disabled = state.coins < Math.floor(state.alc.upCost);

  DOM.ninStatus.textContent = state.nin.count>0 ? `雇用数 ${state.nin.count} / Lv.${state.nin.level}` : '未雇用';
  DOM.ninHireCost.textContent = fmt(Math.floor(state.nin.hireCost));
  DOM.ninUpCost.textContent = fmt(Math.floor(state.nin.upCost));
  DOM.hireNin.disabled = state.coins < Math.floor(state.nin.hireCost);
  DOM.upNin.disabled = state.coins < Math.floor(state.nin.upCost);

  DOM.necStatus.textContent = state.nec.count>0 ? `雇用数 ${state.nec.count} / Lv.${state.nec.level}` : '未雇用';
  DOM.necHireCost.textContent = fmt(Math.floor(state.nec.hireCost));
  DOM.necUpCost.textContent = fmt(Math.floor(state.nec.upCost));
  DOM.hireNec.disabled = state.coins < Math.floor(state.nec.hireCost);
  DOM.upNec.disabled = state.coins < Math.floor(state.nec.upCost);

  DOM.monStatus.textContent = state.mon.count>0 ? `雇用数 ${state.mon.count} / Lv.${state.mon.level}` : '未雇用';
  DOM.monHireCost.textContent = fmt(Math.floor(state.mon.hireCost));
  DOM.monUpCost.textContent = fmt(Math.floor(state.mon.upCost));
  DOM.hireMon.disabled = state.coins < Math.floor(state.mon.hireCost);
  DOM.upMon.disabled = state.coins < Math.floor(state.mon.upCost);

  // Prestige panel
  DOM.permAdvCost.textContent = state.prestige.costAdv;
  DOM.permMerCost.textContent = state.prestige.costMer;
  DOM.permThiCost.textContent = state.prestige.costThi;
  DOM.permAdvOwned.textContent = state.prestige.permAdv|0;
  DOM.permMerOwned.textContent = state.prestige.permMer|0;
  DOM.permThiOwned.textContent = state.prestige.permThi|0;
  DOM.buyPermAdv.disabled = state.rebirthCoins < state.prestige.costAdv;
  DOM.buyPermMer.disabled = state.rebirthCoins < state.prestige.costMer;
  DOM.buyPermThi.disabled = state.rebirthCoins < state.prestige.costThi;

  if(DOM.artifactCount) DOM.artifactCount.textContent = state.artifacts.list.length;
  if(DOM.artCount) DOM.artCount.textContent = state.artifacts.list.length;
  if(DOM.artCrit) DOM.artCrit.textContent = '+'+Math.round((state.artifacts.bonus.crit||0)*1000)/10+'%';
  if(DOM.artDmg) DOM.artDmg.textContent = '+'+Math.round((state.artifacts.bonus.dmg||0)*100)+'%';
  if(DOM.artCoin) DOM.artCoin.textContent = '+'+Math.round((state.artifacts.bonus.coin||0)*100)+'%';

  // Totals & bests
  const totalDps = advTot + thiTot;
  DOM.totalDps.textContent = totalDps.toFixed(1);
  DOM.totalCps.textContent = merTot.toFixed(1);
  state.run.bestDps = Math.max(state.run.bestDps||0, totalDps);
  state.run.bestCps = Math.max(state.run.bestCps||0, merTot);

  updateQtyUI();
  updateFmtUI();
  updateBulkPreviews();
  refreshCollection();
}

// ====== セーブ／ロード ======
function save(){
  if(IS_RESETTING) return;
  state.lastSaved = Date.now();
  Storage.set(SAVE_KEY, JSON.stringify(state));
  DOM.saveHint.textContent = new Date().toLocaleTimeString();
}
function load(){
  let raw = Storage.get(SAVE_KEY);
  if(!raw){
    const oldKeys = ['monster_clicker_v3_boss_artifact_challenge_ja','monster_clicker_v2_multi_units_ja','monster_clicker_v1_ja'];
    for(const k of oldKeys){ const v = Storage.get(k); if(v){ raw=v; break; } }
  }
  if(!raw) return;
  try{
    const data = JSON.parse(raw);
    migrateOldSave(data);
    Object.assign(state, data);
    if(!state.lastSaved) state.lastSaved = Date.now();
    recalcArtifactBonus();
    updateMonsterSkin();
    enterBossIfNeeded();
    applyPermBaseline();
    monkApplyMods();
  }catch(e){ console.warn('load failed', e); }
}

// Offline progress (cap 8h)
function applyOfflineProgress(seconds, silent=true){
  const cps = state.mer.cps * state.mer.count * coinMultForMerchants();
  const gain = Math.floor(cps * seconds);
  if(gain>0){ state.coins += gain; state.run.coinsEarned += gain; }

  const advDps = state.adv.dmg * state.adv.count * dmgMult();
  const thiDps = state.thi.dmg * state.thi.count * (1/state.thi.interval) * dmgMult();
  let damage = (advDps + thiDps) * seconds;
  let kills = 0, coinsFromKills = 0;
  let guard = 0;
  while(damage > 0 && guard < 30000){
    guard++;
    const hp = state.monster.hp;
    if(damage >= hp){
      damage -= hp;
      const baseR = monsterReward(state.monster.level);
      let reward = Math.floor(baseR * coinMultBase());
      const killBonus = Math.floor(baseR * (0.01 * (state.alc.level||0)) * coinMultBase());
      reward += killBonus;
      state.coins += reward; state.run.coinsEarned += reward; coinsFromKills += reward;
      if(isBossFloor(state.monster.level)) state.run.bossKills++;
      toNextMonster();
      kills++;
    } else {
      state.monster.hp -= damage;
      damage = 0;
    }
  }
  LAST_OFFLINE = {coinsFromCps:gain, coinsFromKills:coinsFromKills, kills:kills};
  if(!silent && (gain + coinsFromKills)>0) SFX.coin();
  return gain;
}

// ====== ループ ======
let last = performance.now();
function loop(now){
  const dt = Math.min(0.2, (now-last)/1000);
  last = now;

  if(state.combo.value>1){
    state.combo.value = Math.max(1, state.combo.value - state.combo.decayPerSec*dt);
  }

  tickBuffs(dt);

  if(state.boss.active){
    state.boss.timeLeft -= dt;
    if(state.boss.timeLeft <= 0){
      log('ボス討伐失敗… 1階層戻ります');
      state.monster.level = Math.max(1, state.monster.level-1);
      state.monster.maxHp = monsterHP(state.monster.level);
      state.monster.hp = state.monster.maxHp;
      updateMonsterSkin();
      enterBossIfNeeded();
    }
    paladinTimeAura(dt);
  }

  if(state.adv.count>0 && canUseAdv()){
    state.adv.timer += dt;
    if(state.adv.timer >= 1){
      const times = Math.floor(state.adv.timer / 1);
      state.adv.timer -= times*1;
      if(times>0){ dealDamage(state.adv.dmg * state.adv.count * times, 'auto'); }
    }
  }
  if(state.thi.count>0 && canUseThi()){
    state.thi.timer += dt;
    while(state.thi.timer >= state.thi.interval){
      state.thi.timer -= state.thi.interval;
      dealDamage(state.thi.dmg * state.thi.count, 'auto');
    }
  }
  if(state.mer.count>0 && canUseMer(){
    state.mer.timer += dt;
    if(state.mer.timer >= 1){
      const times = Math.floor(state.mer.timer / 1);
      state.mer.timer -= times*1;
      addCoins(Math.floor(state.mer.cps * state.mer.count * coinMultForMerchants() * times));
      refreshUI();
    }
  }

  if(state.bard.count>0){
    state.bard.timer += dt;
    const intv = state.bard.interval;
    if(state.bard.timer >= intv){
      const times = Math.floor(state.bard.timer / intv);
      state.bard.timer -= times*intv;
      bardSong(times);
    }
  }
  if(state.pal.count>0){
    state.pal.timer += dt;
    if(state.pal.timer >= 1){
      const times = Math.floor(state.pal.timer / 1);
      state.pal.timer -= times*1;
      paladinAttack(times);
    }
  }
  if(state.nin.count>0){
    ninjaAttack(dt);
  }
  necroTick(dt);

  requestAnimationFrame(loop);
}

// ====== イベント ======
function attack(){ dealDamage(state.player.dmg, 'click'); }
DOM.attackBtn.addEventListener('click', attack);
DOM.monsterBox.addEventListener('click', attack);
window.addEventListener('keydown', (e)=>{
  if(e.code==='Space'){ e.preventDefault(); attack(); }
  if(e.key==='1') setBuyQty(1);
  if(e.key==='2') setBuyQty(10);
  if(e.key==='3') setBuyQty(100);
  if(e.key==='4') setBuyQty('max');
  if(e.key==='b' || e.key==='B') buyClick();
  if(e.key==='a' || e.key==='A') hireAdv();
  if(e.key==='m' || e.key==='M') hireMer();
  if(e.key==='t' || e.key==='T') hireThi();
  if(e.key==='r' || e.key==='R') setTab('rebirth');
});

DOM.buyClick.addEventListener('click', buyClick);
DOM.hireAdv.addEventListener('click', hireAdv); DOM.upAdv.addEventListener('click', upAdv);
DOM.hireMer.addEventListener('click', hireMer); DOM.upMer.addEventListener('click', upMer);
DOM.hireThi.addEventListener('click', hireThi); DOM.upThi.addEventListener('click', upThi);

DOM.hireBard.addEventListener('click', hireBard); DOM.upBard.addEventListener('click', upBard);
DOM.hirePal.addEventListener('click', hirePal); DOM.upPal.addEventListener('click', upPal);
DOM.hireAlc.addEventListener('click', hireAlc); DOM.upAlc.addEventListener('click', upAlc);
DOM.hireNin.addEventListener('click', hireNin); DOM.upNin.addEventListener('click', upNin);
DOM.hireNec.addEventListener('click', hireNec); DOM.upNec.addEventListener('click', upNec);
DOM.hireMon.addEventListener('click', hireMon); DOM.upMon.addEventListener('click', upMon);

DOM.rebirthBtn.addEventListener('click', ()=>{ doRebirth(); tryUnlockAchievements(); });

function setTab(which){
  const shop = which==='shop' || which===true;
  const reb = which==='rebirth';
  const col = which==='collection';
  DOM.tabShop.classList.toggle('active', shop);
  DOM.tabRebirth.classList.toggle('active', reb);
  DOM.tabCollection.classList.toggle('active', col);
  DOM.panelShop.style.display = shop? 'block':'none';
  DOM.panelRebirth.style.display = reb? 'block':'none';
  DOM.panelCollection.style.display = col? 'block':'none';
}
DOM.tabShop.addEventListener('click', ()=>setTab('shop'));
DOM.tabRebirth.addEventListener('click', ()=>setTab('rebirth'));
DOM.tabCollection.addEventListener('click', ()=>setTab('collection'));

function setBuyQty(q){ state.buyQty = q; refreshUI(); save(); }
DOM.qty1.addEventListener('click', ()=>setBuyQty(1));
DOM.qty10.addEventListener('click', ()=>setBuyQty(10));
DOM.qty100.addEventListener('click', ()=>setBuyQty(100));
DOM.qtyMax.addEventListener('click', ()=>setBuyQty('max'));

DOM.fmtJP.addEventListener('click', ()=>{ NUMFMT.mode='jp'; refreshUI(); Storage.set(SAVE_KEY+'_fmt','jp'); });
DOM.fmtSI.addEventListener('click', ()=>{ NUMFMT.mode='si'; refreshUI(); Storage.set(SAVE_KEY+'_fmt','si'); });

DOM.soundToggle.addEventListener('change', (e)=>{ state.sound = e.target.checked; SFX.setEnabled(state.sound); });
SFX.setEnabled(state.sound);

DOM.toggleLog.addEventListener('click', ()=>{
  state.ui.logCollapsed = !state.ui.logCollapsed;
  DOM.battlelog.classList.toggle('collapsed', state.ui.logCollapsed);
});

// Challenge selection
DOM.challengeList.addEventListener('change', (e)=>{
  const v = (DOM.challengeList.querySelector('input[name="challenge"]:checked')||{}).value || '';
  state.challenge.selected = v;
  refreshChallengeStatus();
  save();
});
function refreshChallengeStatus(){
  const sel = state.challenge.selected||'';
  const done = state.challenge.completed||[];
  DOM.challengeStatus.textContent = `選択：${challengeDesc(sel)} ／ 達成済み：${done.map(challengeDesc).join('、')||'なし'}（恒久+${(state.challenge.bonusStack*100).toFixed(0)}%）`;
}

// Titles
DOM.titleSelect.addEventListener('change', ()=>{
  state.achv.selectedTitle = DOM.titleSelect.value || '';
  save(); refreshCollection();
});

// Export/Import/Reset
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  navigator.clipboard.writeText(data).catch(()=>{});
  alert('セーブデータをクリップボードへコピーしました。\\n\\n'+data.substring(0,64)+'...');
});
document.getElementById('importBtn').addEventListener('click', ()=>{
  const data = prompt('エクスポート文字列を貼り付けてください'); if(!data) return;
  try{ const obj = JSON.parse(decodeURIComponent(escape(atob(data)))); migrateOldSave(obj); Object.assign(state, obj); recalcArtifactBonus(); updateMonsterSkin(); enterBossIfNeeded(); applyPermBaseline(); monkApplyMods(); refreshUI(); save(); alert('読み込み完了！'); }catch(e){ alert('読み込みに失敗しました'); }
});

function doHardReset(){
  IS_RESETTING = true;
  try{ if(saveIntervalId) clearInterval(saveIntervalId); }catch(e){}
  try{
    const KEYS = [SAVE_KEY, 'monster_clicker_v3_boss_artifact_challenge_ja','monster_clicker_v2_multi_units_ja','monster_clicker_v1_ja'];
    KEYS.forEach(k=>Storage.remove(k));
  }catch(e){ console.warn('hard reset failed', e); }
  location.reload();
}
function hardReset(){
  const modal = document.getElementById('resetModal');
  if(modal){ modal.style.display='flex'; return; }
  if(!window.confirm('本当に初期化しますか？ この操作は取り消せません。')) return;
  doHardReset();
}
document.getElementById('hardResetBtn').addEventListener('click', hardReset);
document.getElementById('confirmReset').addEventListener('click', doHardReset);
document.getElementById('cancelReset').addEventListener('click', ()=>{ const m=document.getElementById('resetModal'); if(m) m.style.display='none'; });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ const m=document.getElementById('resetModal'); if(m && m.style.display==='flex'){ m.style.display='none'; } const r=DOM.resultModal; if(r && r.style.display==='flex'){ r.style.display='none'; } } });

// Persist on tab hide/close
window.addEventListener('beforeunload', ()=>{ try{ if(!IS_RESETTING) save(); }catch(e){} });
document.addEventListener('visibilitychange', ()=>{ try{ if(document.hidden && !IS_RESETTING) save(); }catch(e){} });

// ====== 初期起動 ======
function init(){
  load();
  NUMFMT.mode = (Storage.get(SAVE_KEY+'_fmt')||'jp');
  // offline progress (CPS+DPS)
  const now = Date.now();
  const lastTs = state.lastSaved || now;
  let elapsedSec = Math.max(0, (now - lastTs)/1000);
  if(elapsedSec > 3){
    const cap = Math.min(elapsedSec, 8*3600);
    const gain = applyOfflineProgress(cap, true);
    const totalGain = gain + (LAST_OFFLINE.coinsFromKills||0);
    const killed = LAST_OFFLINE.kills||0;
    if(totalGain>0 || killed>0){ DOM.saveHint.textContent = `オフライン +${fmt(totalGain)}🪙 / ${Math.floor(cap)}s${killed? '・'+killed+'討伐':''}`; }
  }
  state.lastSaved = now;

  state.monster.maxHp = monsterHP(state.monster.level);
  if(state.monster.hp==null) state.monster.hp = state.monster.maxHp;
  updateMonsterSkin();
  enterBossIfNeeded();
  recalcArtifactBonus();
  monkApplyMods();
  refreshChallengeStatus();
  DOM.battlelog.classList.toggle('collapsed', state.ui.logCollapsed);
  refreshUI();
  requestAnimationFrame((t)=>{ last=t; requestAnimationFrame(loop); });
  saveIntervalId = setInterval(()=>{ save(); tryUnlockAchievements(); }, 5000);
}

try{ init(); }catch(e){ console.error(e); if(window.__showPanic) window.__showPanic(e && (e.stack||e.message||e)); }

// ====== セルフテスト ======
(function runSelfTests(){
  const tests = [];
  function eq(desc, a, b){ tests.push({desc, pass: a===b, got:a, expected:b}); }
  function ok(desc, cond){ tests.push({desc, pass: !!cond, got:cond, expected:true}); }

  try{
    eq('fmtSI 999 == "999"', fmtSI(999), '999');
    ok('fmtSI 1000 suffix', fmtSI(1000).endsWith('K'));
    eq('monsterHP base(1) == 8', monsterHP(1), 8);
    ok('monsterHP(2) >= 9', monsterHP(2) >= 9);
    // rebirth coin thresholds
    const prevHL = state.highestLevelThisRun;
    state.highestLevelThisRun = 49; eq('preview 49 => 0', previewRebirthCoins(), 0);
    state.highestLevelThisRun = 50; eq('preview 50 => 1', previewRebirthCoins(), 1);
    state.highestLevelThisRun = 75; eq('preview 75 => 2', previewRebirthCoins(), 2);
    state.highestLevelThisRun = 100; eq('preview 100 => 3', previewRebirthCoins(), 3);
    state.highestLevelThisRun = prevHL;
    // click cost mul softened
    eq('click cost mul', state.player.costMul, 1.07);
    // monk decay lower bound
    state.mon.level = 10; monkApplyMods(); ok('combo decay not below 0.1', state.combo.decayPerSec >= 0.1);
  }catch(e){ console.warn('self test error', e); }

  const failed = tests.filter(t=>!t.pass);
  if(failed.length){ console.warn('Tests failed:', failed); } else { console.log('All tests passed:', tests.length); }
})();
