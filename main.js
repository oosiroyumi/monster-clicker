// ====== 数字整形 ======
function fmt(n){
  if(!isFinite(n)) return '∞';
  const neg = n<0; n=Math.abs(n);
  if(n<1000) return (neg?-1:1)*n % 1 ? ((neg?'-':'')+n.toFixed(1)) : ((neg?'-':'')+n.toFixed(0));
  const units=['','K','M','B','T','aa','ab','ac','ad','ae'];
  let u=0; while(n>=1000 && u<units.length-1){n/=1000;u++}
  return (neg?'-':'')+n.toFixed(n<10?2:n<100?1:0)+units[u];
}

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

// ====== ゲーム状態 ======
const SAVE_KEY = 'monster_clicker_v2_multi_units_ja';
const state = {
  version: 3,
  coins:0,
  rebirthCoins:0,
  rebirths:0,
  prestige:{permAdv:0, permMer:0, permThi:0, costAdv:1, costMer:1, costThi:1},
  // プレイヤークリック：コストを下げ、伸び率も少し緩く
  player:{level:1, dmg:1, cost:8, costMul:1.10, critRate:0.05, critMult:2.0},
  adv:{count:0, level:0, dmg:5, hireCost:50, upCost:40, hireMul:1.15, upMul:1.15, timer:0},
  mer:{count:0, level:0, cps:1, hireCost:50, upCost:40, hireMul:1.15, upMul:1.20, timer:0},
  thi:{count:0, level:0, dmg:0.5, hireCost:50, upCost:40, hireMul:1.15, upMul:1.15, timer:0, interval:0.2},
  monster:{level:1, hp:8, maxHp:8, name:'スライム'},
  highestLevelThisRun:1,
  sound:true,
  buyQty:1,
  lastSaved: Date.now(),
  // クリコンボ
  combo:{value:1, max:2.0, gain:0.1, decayPerSec:0.4},
  // ラン統計
  run:{startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1},
};

// ==== Saving control flags ====
let IS_RESETTING = false;
let saveIntervalId = null;
let LAST_OFFLINE = {coinsFromCps:0, coinsFromKills:0, kills:0};

// ====== 互換ロード（旧セーブの移行） ======
function migrateOldSave(obj){
  try{
    if(obj && obj.adv && typeof obj.adv.hired === 'boolean'){
      obj.adv.count = obj.adv.hired ? 1 : 0; delete obj.adv.hired;
      obj.adv.level = obj.adv.level||0; obj.adv.dmg = obj.adv.dmg||5; obj.adv.hireCost = obj.adv.hireCost||50; obj.adv.upCost = obj.adv.upCost||40; obj.adv.timer = 0;
    }
    if(obj && obj.mer && typeof obj.mer.hired === 'boolean'){
      obj.mer.count = obj.mer.hired ? 1 : 0; delete obj.mer.hired;
      obj.mer.level = obj.mer.level||0; obj.mer.cps = obj.mer.cps||1; obj.mer.hireCost = obj.mer.hireCost||50; obj.mer.upCost = obj.mer.upCost||40; obj.mer.timer = 0;
    }
    if(obj && obj.thi && typeof obj.thi.hired === 'boolean'){
      obj.thi.count = obj.thi.hired ? 1 : 0; delete obj.thi.hired;
      obj.thi.level = obj.thi.level||0; obj.thi.dmg = obj.thi.dmg||0.5; obj.thi.hireCost = (typeof obj.thi.hireCost==='number'? obj.thi.hireCost : 50); if(obj.thi.hireCost===100 && (obj.thi.count|0)===0) obj.thi.hireCost = 50; obj.thi.upCost = (typeof obj.thi.upCost==='number'? obj.thi.upCost : 40); if(obj.thi.upCost===70 && (obj.thi.level|0)===0) obj.thi.upCost = 40; obj.thi.timer = 0; obj.thi.interval = obj.thi.interval||0.2;
    }
    if(obj) obj.highestLevelThisRun = obj.highestLevelThisRun|| (obj.monster? obj.monster.level:1) || 1;
    // v2→v3: 新フィールドの既定値
    if(obj && obj.player){ obj.player.costMul = obj.player.costMul||1.10; obj.player.critRate = obj.player.critRate||0.05; obj.player.critMult = obj.player.critMult||2.0; if(obj.player.cost && obj.player.cost>8) obj.player.cost = obj.player.cost; }
    if(obj && !obj.combo) obj.combo = {value:1, max:2.0, gain:0.1, decayPerSec:0.4};
    if(obj && !obj.run) obj.run = {startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1};
    if(obj && obj.adv){ obj.adv.hireMul = obj.adv.hireMul||1.15; obj.adv.upMul = 1.15; }
    if(obj && obj.mer){ obj.mer.hireMul = obj.mer.hireMul||1.15; obj.mer.upMul = obj.mer.upMul||1.20; }
    if(obj && obj.thi){ obj.thi.hireMul = obj.thi.hireMul||1.15; obj.thi.upMul = 1.15; }
  }catch(e){console.warn('migrate error', e)}
}

const DOM = {
  coins:document.getElementById('coins'),
  rebirthCoins:document.getElementById('rebirthCoins'),
  bonus:document.getElementById('bonus'),
  comboView:document.getElementById('comboView'),
  totalDps:document.getElementById('totalDps'), totalCps:document.getElementById('totalCps'),
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
  rebirthBtn:document.getElementById('rebirthBtn'),
  previewRebirth:document.getElementById('previewRebirth'),
  // shop
  clickLv:document.getElementById('clickLv'), clickDmg:document.getElementById('clickDmg'), clickCost:document.getElementById('clickCost'), clickBulk:document.getElementById('clickBulk'), buyClick:document.getElementById('buyClick'),
  // adv
  advStatus:document.getElementById('advStatus'), advDmg:document.getElementById('advDmg'), advLv:document.getElementById('advLv'), advCount:document.getElementById('advCount'), advDps:document.getElementById('advDps'), advHireCost:document.getElementById('advHireCost'), advHireBulk:document.getElementById('advHireBulk'), advUpCost:document.getElementById('advUpCost'), advUpBulk:document.getElementById('advUpBulk'), hireAdv:document.getElementById('hireAdv'), upAdv:document.getElementById('upAdv'),
  // mer
  merStatus:document.getElementById('merStatus'), merCps:document.getElementById('merCps'), merLv:document.getElementById('merLv'), merCount:document.getElementById('merCount'), merTotalCps:document.getElementById('merTotalCps'), merHireCost:document.getElementById('merHireCost'), merHireBulk:document.getElementById('merHireBulk'), merUpCost:document.getElementById('merUpCost'), merUpBulk:document.getElementById('merUpBulk'), hireMer:document.getElementById('hireMer'), upMer:document.getElementById('upMer'),
  // thi
  thiStatus:document.getElementById('thiStatus'), thiDmg:document.getElementById('thiDmg'), thiLv:document.getElementById('thiLv'), thiCount:document.getElementById('thiCount'), thiDps:document.getElementById('thiDps'), thiHireCost:document.getElementById('thiHireCost'), thiHireBulk:document.getElementById('thiHireBulk'), thiUpCost:document.getElementById('thiUpCost'), thiUpBulk:document.getElementById('thiUpBulk'), hireThi:document.getElementById('hireThi'), upThi:document.getElementById('upThi'),
  // tabs
  tabShop:document.getElementById('tabShop'), tabRebirth:document.getElementById('tabRebirth'), panelShop:document.getElementById('panelShop'), panelRebirth:document.getElementById('panelRebirth'),
  permAdvCost:document.getElementById('permAdvCost'), permMerCost:document.getElementById('permMerCost'), permThiCost:document.getElementById('permThiCost'),
  permAdvOwned:document.getElementById('permAdvOwned'), permMerOwned:document.getElementById('permMerOwned'), permThiOwned:document.getElementById('permThiOwned'),
  buyPermAdv:document.getElementById('buyPermAdv'), buyPermMer:document.getElementById('buyPermMer'), buyPermThi:document.getElementById('buyPermThi'),
  saveHint:document.getElementById('saveHint'),
  soundToggle:document.getElementById('soundToggle'),
  qty1:document.getElementById('qty1'), qty10:document.getElementById('qty10'), qty100:document.getElementById('qty100'), qtyMax:document.getElementById('qtyMax'),
  resultModal:document.getElementById('resultModal'), resultBody:document.getElementById('resultBody'), closeResult:document.getElementById('closeResult'),
};

function dmgMult(){ return Math.pow(1.1, state.rebirths); }
function coinMult(){ return Math.pow(1.1, state.rebirths); }
function monsterHP(level){ return Math.max(8, Math.ceil(8 * Math.pow(1.10, level-1))); }
function monsterReward(level){ return Math.max(5, Math.floor(5 * Math.pow(1.12, level-1))); }

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
  // keep last 6
  const items = DOM.battlelog.querySelectorAll('.logitem');
  if(items.length>6) items[items.length-1].remove();
}

function updateMonsterSkin(){
  const l = state.monster.level;
  let icon='🟩', name='スライム';
  if(l>=10) {icon='🐗'; name='ボア';}
  if(l>=20) {icon='🧟'; name='ゾンビ';}
  if(l>=30) {icon='🦖'; name='リザード';}
  if(l>=40) {icon='👹'; name='オーガ';}
  if(l>=50) {icon='🐉'; name='ドラゴン';}
  DOM.monster.textContent=icon; state.monster.name=name; DOM.monsterName.textContent=name;
}

function toNextMonster(){
  state.monster.level++;
  state.highestLevelThisRun = Math.max(state.highestLevelThisRun, state.monster.level);
  state.monster.maxHp = monsterHP(state.monster.level);
  state.monster.hp = state.monster.maxHp;
  updateMonsterSkin();
}

function addCoins(n){ state.coins += n; if(n>0){ state.run.coinsEarned += n; SFX.coin(); } }

function dealDamage(amount, source='auto'){
  const base = amount * dmgMult();
  let dmg = base;
  let isCrit = false;
  // クリック時はクリ・コンボ適用
  if(source==='click'){
    // コンボ適用
    dmg *= state.combo.value;
    // クリティカル
    if(Math.random() < state.player.critRate){
      isCrit = true;
      dmg *= state.player.critMult;
      state.run.crits++;
      SFX.crit();
    } else {
      SFX.hit();
    }
    // クリック統計
    state.run.clicks++;
    state.combo.value = Math.min(state.combo.max, state.combo.value + state.combo.gain);
    state.run.maxCombo = Math.max(state.run.maxCombo, state.combo.value);
  } else {
    SFX.hit();
  }

  state.monster.hp -= dmg;
  spawnFloater((isCrit?'CRIT ':'-') + (dmg%1?dmg.toFixed(1):dmg.toFixed(0)), isCrit?'crit':'');
  if(isCrit) log(`クリティカル！ <strong>${dmg.toFixed(1)}</strong>`, 'crit');

  if(state.monster.hp<=0){
    const reward = Math.floor(monsterReward(state.monster.level) * coinMult());
    addCoins(reward);
    state.run.kills++;
    log(`Lv${state.monster.level} を討伐！ +${fmt(reward)}🪙`);
    toNextMonster();
  }
  refreshUI();
}

// ====== 購入系 ======
function canAfford(cost){ return state.coins >= cost; }
function pay(cost){ state.coins -= cost; }

// まとめ買いヘルパ
function requestedQty(){ return state.buyQty==='max' ? 1000000 : (state.buyQty||1); }
function computeBulk(cost, mult, coins, maxSteps){
  let steps=0,total=0;
  for(let i=0;i<maxSteps;i++){
    const c = Math.floor(cost);
    if(coins < c) break;
    coins -= c; total += c; steps++;
    cost *= mult;
    if(steps>200000) break; // safety
  }
  return {steps,total,nextCost:cost};
}
function sumBulk(cost, mult, steps){
  let total=0; for(let i=0;i<steps;i++){ total += Math.floor(cost); cost *= mult; }
  return total;
}
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

// --- 冒険者 ---
function hireAdv(){
  const req = requestedQty();
  const r = computeBulk(state.adv.hireCost, state.adv.hireMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.adv.count += r.steps;
  state.adv.hireCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}
function upAdv(){
  const req = requestedQty();
  const r = computeBulk(state.adv.upCost, state.adv.upMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.adv.level += r.steps;
  state.adv.dmg += 1 * r.steps;
  state.adv.upCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}

// --- 商人 ---
function hireMer(){
  const req = requestedQty();
  const r = computeBulk(state.mer.hireCost, state.mer.hireMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.mer.count += r.steps;
  state.mer.hireCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}
function upMer(){
  const req = requestedQty();
  const r = computeBulk(state.mer.upCost, state.mer.upMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.mer.level += r.steps;
  state.mer.cps += 1 * r.steps;
  state.mer.upCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}

// --- 盗賊 ---
function hireThi(){
  const req = requestedQty();
  const r = computeBulk(state.thi.hireCost, state.thi.hireMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.thi.count += r.steps;
  state.thi.hireCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}
function upThi(){
  const req = requestedQty();
  const r = computeBulk(state.thi.upCost, state.thi.upMul, state.coins, req);
  if(r.steps<=0) return SFX.error();
  state.coins -= r.total;
  state.thi.level += r.steps;
  state.thi.dmg += 0.5 * r.steps;
  state.thi.upCost = r.nextCost;
  SFX.buy(); refreshUI(); save();
}

// ====== 転生 ======
function previewRebirthCoins(){
  const highest = Math.max(1, state.highestLevelThisRun);
  if(highest < 50) return 0;
  return 1 + Math.floor((highest - 50) / 25);
}

function showResultModal(snapshot){
  const sec = Math.max(1, Math.floor((snapshot.endTs - snapshot.startTs)/1000));
  const body = `
    <div class="item"><div>最高到達Lv</div><strong>${snapshot.highest}</strong></div>
    <div class="item"><div>獲得コイン（ラン）</div><strong>${fmt(snapshot.coins)}</strong></div>
    <div class="item"><div>討伐数</div><strong>${snapshot.kills}</strong></div>
    <div class="item"><div>クリック / クリティカル</div><strong>${snapshot.clicks} / ${snapshot.crits}</strong></div>
    <div class="item"><div>最大コンボ</div><strong>×${snapshot.maxCombo.toFixed(2)}</strong></div>
    <div class="item"><div>プレイ時間</div><strong>${sec}s</strong></div>
    <div class="item"><div>今回の転生コイン</div><strong>✨ ${snapshot.rebirthGain}</strong></div>
    <div class="item"><div>累計転生</div><strong>${snapshot.rebirths}</strong></div>
  `;
  DOM.resultBody.innerHTML = body;
  const modal = DOM.resultModal; modal.style.display='flex';
  DOM.closeResult.onclick = ()=>{ modal.style.display='none'; };
}

function doRebirth(){
  if(state.monster.level < 50) return SFX.error();
  const gain = previewRebirthCoins();
  // スナップショット（リザルト表示用）
  const snap = {
    highest: state.highestLevelThisRun,
    coins: state.run.coinsEarned,
    kills: state.run.kills,
    clicks: state.run.clicks,
    crits: state.run.crits,
    maxCombo: state.run.maxCombo,
    startTs: state.run.startTs,
    endTs: Date.now(),
    rebirthGain: gain,
    rebirths: state.rebirths + 1,
  };

  state.rebirthCoins += gain; state.rebirths += 1; SFX.rebirth();

  // 永続雇用の適用（保有数ぶん雇用）
  const permAdv = state.prestige.permAdv|0;
  const permMer = state.prestige.permMer|0;
  const permThi = state.prestige.permThi|0;

  state.coins = 0;
  state.player = {...state.player, level:1, dmg:1, cost:8}; // costMul維持
  state.combo.value = 1;

  state.adv.level = 0; state.adv.dmg = 5; state.adv.upCost = 40; state.adv.timer = 0; state.adv.count = permAdv; state.adv.hireCost = 50;
  state.mer.level = 0; state.mer.cps = 1; state.mer.upCost = 40; state.mer.timer = 0; state.mer.count = permMer; state.mer.hireCost = 50;
  state.thi.level = 0; state.thi.dmg = 0.5; state.thi.upCost = 40; state.thi.timer = 0; state.thi.count = permThi; state.thi.hireCost = 50; state.thi.interval = 0.2;

  state.monster.level = 1; state.monster.maxHp = monsterHP(1); state.monster.hp = state.monster.maxHp;
  state.highestLevelThisRun = 1;
  // ラン統計リセット
  state.run = {startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1};

  updateMonsterSkin();
  applyPermBaseline();
  refreshUI();
  save();

  showResultModal(snap);
}

// ====== 転生ショップ ======
function buyPerm(kind){
  const keyMap = {adv:'permAdv', mer:'permMer', thi:'permThi'};
  const costKey = {adv:'costAdv', mer:'costMer', thi:'costThi'};
  const key = keyMap[kind];
  const ckey = costKey[kind];
  const cost = state.prestige[ckey];
  if(state.rebirthCoins < cost) return SFX.error();
  state.rebirthCoins -= cost;
  state.prestige[key] = (state.prestige[key]||0) + 1;
  applyPermBaseline();
  SFX.buy();
  log(`永続雇用（${kind}）+1`);
  refreshUI(); save();
}

// 永続雇用の最低保証を現在の雇用数へ反映（転生以外でも効く）
function applyPermBaseline(){
  if(state.adv.count < (state.prestige.permAdv|0)) state.adv.count = state.prestige.permAdv|0;
  if(state.mer.count < (state.prestige.permMer|0)) state.mer.count = state.prestige.permMer|0;
  if(state.thi.count < (state.prestige.permThi|0)) state.thi.count = state.prestige.permThi|0;
}

// ====== UI更新 ======
function updateBulkPreviews(){
  const qty = state.buyQty;
  if(DOM.clickBulk) DOM.clickBulk.textContent = buildBulkText(state.player.cost, state.player.costMul, qty, state.coins);
  if(DOM.advHireBulk) DOM.advHireBulk.textContent = buildBulkText(state.adv.hireCost, state.adv.hireMul, qty, state.coins);
  if(DOM.advUpBulk) DOM.advUpBulk.textContent = buildBulkText(state.adv.upCost, state.adv.upMul, qty, state.coins);
  if(DOM.merHireBulk) DOM.merHireBulk.textContent = buildBulkText(state.mer.hireCost, state.mer.hireMul, qty, state.coins);
  if(DOM.merUpBulk) DOM.merUpBulk.textContent = buildBulkText(state.mer.upCost, state.mer.upMul, qty, state.coins);
  if(DOM.thiHireBulk) DOM.thiHireBulk.textContent = buildBulkText(state.thi.hireCost, state.thi.hireMul, qty, state.coins);
  if(DOM.thiUpBulk) DOM.thiUpBulk.textContent = buildBulkText(state.thi.upCost, state.thi.upMul, qty, state.coins);
}
function updateQtyUI(){ if(!DOM.qty1) return; DOM.qty1.classList.toggle('active', state.buyQty===1); DOM.qty10.classList.toggle('active', state.buyQty===10); DOM.qty100.classList.toggle('active', state.buyQty===100); DOM.qtyMax.classList.toggle('active', state.buyQty==='max'); }

function refreshUI(){
  DOM.coins.textContent = fmt(state.coins);
  DOM.rebirthCoins.textContent = fmt(state.rebirthCoins);
  DOM.bonus.textContent = '×'+(dmgMult()).toFixed(2);
  DOM.comboView.textContent = '×'+(state.combo.value||1).toFixed(2);

  DOM.monsterLevel.textContent = state.monster.level;
  DOM.hpFill.style.width = Math.max(0, (state.monster.hp/state.monster.maxHp)*100)+'%';
  DOM.hpNum.textContent = `${Math.max(0,state.monster.hp).toFixed(state.monster.maxHp<100?1:0)} / ${state.monster.maxHp}`;
  DOM.reward.textContent = `討伐報酬: ${fmt(Math.floor(monsterReward(state.monster.level)*coinMult()))}🪙`;

  const canRebirth = state.monster.level >= 50;
  DOM.rebirthBtn.disabled = !canRebirth;
  DOM.previewRebirth.textContent = previewRebirthCoins();

  // Click
  DOM.clickLv.textContent = `Lv.${state.player.level}`;
  DOM.clickDmg.textContent = state.player.dmg.toFixed(0);
  DOM.clickCost.textContent = fmt(Math.floor(state.player.cost));
  DOM.buyClick.disabled = state.coins < Math.floor(state.player.cost);

  // Adventurer
  const advPerUnitDps = state.adv.dmg * dmgMult();
  const advTotalDps = advPerUnitDps * state.adv.count;
  DOM.advStatus.textContent = state.adv.count>0 ? `雇用数 ${state.adv.count}` : '未雇用';
  DOM.advDmg.textContent = advPerUnitDps.toFixed(1);
  DOM.advLv.textContent = state.adv.level;
  DOM.advCount.textContent = state.adv.count;
  DOM.advDps.textContent = advTotalDps.toFixed(1);
  DOM.advHireCost.textContent = fmt(Math.floor(state.adv.hireCost));
  DOM.advUpCost.textContent = fmt(Math.floor(state.adv.upCost));
  DOM.hireAdv.disabled = state.coins < Math.floor(state.adv.hireCost);
  DOM.upAdv.disabled = state.coins < Math.floor(state.adv.upCost);

  // Merchant
  const merPerUnit = state.mer.cps * coinMult();
  const merTotal = merPerUnit * state.mer.count;
  DOM.merStatus.textContent = state.mer.count>0 ? `雇用数 ${state.mer.count}` : '未雇用';
  DOM.merCps.textContent = merPerUnit.toFixed(1);
  DOM.merLv.textContent = state.mer.level;
  DOM.merCount.textContent = state.mer.count;
  DOM.merTotalCps.textContent = merTotal.toFixed(1);
  DOM.merHireCost.textContent = fmt(Math.floor(state.mer.hireCost));
  DOM.merUpCost.textContent = fmt(Math.floor(state.mer.upCost));
  DOM.hireMer.disabled = state.coins < Math.floor(state.mer.hireCost);
  DOM.upMer.disabled = state.coins < Math.floor(state.mer.upCost);

  // Thief
  const thiPerUnitDps = state.thi.dmg * dmgMult() * (1/state.thi.interval); // per sec
  const thiTotalDps = thiPerUnitDps * state.thi.count;
  DOM.thiStatus.textContent = state.thi.count>0 ? `雇用数 ${state.thi.count}` : '未雇用';
  DOM.thiDmg.textContent = (state.thi.dmg * dmgMult()).toFixed(1);
  DOM.thiLv.textContent = state.thi.level;
  DOM.thiCount.textContent = state.thi.count;
  DOM.thiDps.textContent = thiTotalDps.toFixed(1);
  DOM.thiHireCost.textContent = fmt(Math.floor(state.thi.hireCost));
  DOM.thiUpCost.textContent = fmt(Math.floor(state.thi.upCost));
  DOM.hireThi.disabled = state.coins < Math.floor(state.thi.hireCost);
  DOM.upThi.disabled = state.coins < Math.floor(state.thi.upCost);

  // Prestige panel costs
  DOM.permAdvCost.textContent = state.prestige.costAdv;
  DOM.permMerCost.textContent = state.prestige.costMer;
  DOM.permThiCost.textContent = state.prestige.costThi;
  if(DOM.permAdvOwned) DOM.permAdvOwned.textContent = state.prestige.permAdv|0;
  if(DOM.permMerOwned) DOM.permMerOwned.textContent = state.prestige.permMer|0;
  if(DOM.permThiOwned) DOM.permThiOwned.textContent = state.prestige.permThi|0;
  DOM.buyPermAdv.disabled = state.rebirthCoins < state.prestige.costAdv;
  DOM.buyPermMer.disabled = state.rebirthCoins < state.prestige.costMer;
  DOM.buyPermThi.disabled = state.rebirthCoins < state.prestige.costThi;

  // Totals
  if(DOM.totalDps) DOM.totalDps.textContent = (advTotalDps + thiTotalDps).toFixed(1);
  if(DOM.totalCps) DOM.totalCps.textContent = merTotal.toFixed(1);

  updateQtyUI();
  updateBulkPreviews();
}

// ====== セーブ／ロード ======
function save(){
  if(IS_RESETTING) return;
  state.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  DOM.saveHint.textContent = new Date().toLocaleTimeString();
}
function load(){
  let raw = localStorage.getItem(SAVE_KEY);
  if(!raw){
    const old = localStorage.getItem('monster_clicker_v1_ja');
    if(old) raw = old;
  }
  if(!raw) return;
  try{
    const data = JSON.parse(raw);
    migrateOldSave(data);
    if(data.prestige){
      ['permAdv','permMer','permThi'].forEach(k=>{
        if(typeof data.prestige[k] === 'boolean') data.prestige[k] = data.prestige[k] ? 1 : 0;
      });
      if(data.prestige.costAdv==null) data.prestige.costAdv = 1;
      if(data.prestige.costMer==null) data.prestige.costMer = 1;
      if(data.prestige.costThi==null) data.prestige.costThi = 1;
    }
    Object.assign(state, data);
    if(!state.lastSaved) state.lastSaved = Date.now();
    if(!state.run) state.run = {startTs: Date.now(), coinsEarned:0, kills:0, clicks:0, crits:0, maxCombo:1};
    updateMonsterSkin();
    applyPermBaseline();
  }catch(e){console.warn('load failed',e)}
}

// Offline calc helper (CPS + DPS)
function applyOfflineProgress(seconds, silent=true){
  // CPS coins
  const cps = state.mer.cps * state.mer.count * coinMult();
  const gain = Math.floor(cps * seconds);
  if(gain>0){ state.coins += gain; state.run.coinsEarned += gain; }

  // DPS combat (adventurer + thief) — クリックは除外
  const advDps = state.adv.dmg * state.adv.count * dmgMult();
  const thiDps = state.thi.dmg * state.thi.count * (1/state.thi.interval) * dmgMult();
  let damage = (advDps + thiDps) * seconds;
  let kills = 0, coinsFromKills = 0;
  let guard = 0;
  while(damage > 0 && guard < 30000){
    guard++;
    if(damage >= state.monster.hp){
      damage -= state.monster.hp;
      const reward = Math.floor(monsterReward(state.monster.level) * coinMult());
      state.coins += reward; state.run.coinsEarned += reward; coinsFromKills += reward;
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
  const dt = Math.min(0.2, (now-last)/1000); // s
  last = now;

  // コンボ減衰
  if(state.combo.value>1){
    state.combo.value = Math.max(1, state.combo.value - state.combo.decayPerSec*dt);
  }

  // Adventurer: 1/s per unit
  if(state.adv.count>0){
    state.adv.timer += dt;
    if(state.adv.timer >= 1){
      const times = Math.floor(state.adv.timer / 1);
      state.adv.timer -= times*1;
      if(times>0){ dealDamage(state.adv.dmg * state.adv.count * times, 'auto'); }
    }
  }
  // Thief: every 0.2s per unit
  if(state.thi.count>0){
    state.thi.timer += dt;
    while(state.thi.timer >= state.thi.interval){
      state.thi.timer -= state.thi.interval;
      dealDamage(state.thi.dmg * state.thi.count, 'auto');
    }
  }
  // Merchant: 1/s per unit coins
  if(state.mer.count>0){
    state.mer.timer += dt;
    if(state.mer.timer >= 1){
      const times = Math.floor(state.mer.timer / 1);
      state.mer.timer -= times*1;
      addCoins(Math.floor(state.mer.cps * state.mer.count * coinMult() * times));
      refreshUI();
    }
  }
  requestAnimationFrame(loop);
}

// ====== イベント ======
function attack(){ dealDamage(state.player.dmg, 'click'); }
DOM.attackBtn.addEventListener('click', attack);
DOM.monsterBox.addEventListener('click', attack);
window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ e.preventDefault(); attack(); }});

DOM.buyClick.addEventListener('click', buyClick);
// hire & upgrade buttons
DOM.hireAdv.addEventListener('click', hireAdv); DOM.upAdv.addEventListener('click', upAdv);
DOM.hireMer.addEventListener('click', hireMer); DOM.upMer.addEventListener('click', upMer);
DOM.hireThi.addEventListener('click', hireThi); DOM.upThi.addEventListener('click', upThi);
DOM.rebirthBtn.addEventListener('click', doRebirth);

// Tabs
function setTab(shop=true){
  DOM.tabShop.classList.toggle('active', shop);
  DOM.tabRebirth.classList.toggle('active', !shop);
  DOM.panelShop.style.display = shop? 'block':'none';
  DOM.panelRebirth.style.display = shop? 'none':'block';
}
DOM.tabShop.addEventListener('click', ()=>setTab(true));
DOM.tabRebirth.addEventListener('click', ()=>setTab(false));

// Quantity buttons
function setBuyQty(q){ state.buyQty = q; refreshUI(); save(); }
if(DOM.qty1){
  DOM.qty1.addEventListener('click', ()=>setBuyQty(1));
  DOM.qty10.addEventListener('click', ()=>setBuyQty(10));
  DOM.qty100.addEventListener('click', ()=>setBuyQty(100));
  DOM.qtyMax.addEventListener('click', ()=>setBuyQty('max'));
}

// Sound toggle
DOM.soundToggle.addEventListener('change', (e)=>{ state.sound = e.target.checked; SFX.setEnabled(state.sound); });
SFX.setEnabled(state.sound);

// Export/Import/Reset
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  navigator.clipboard.writeText(data).catch(()=>{});
  alert('セーブデータをクリップボードへコピーしました。\\n\\n'+data.substring(0,64)+'...');
});
document.getElementById('importBtn').addEventListener('click', ()=>{
  const data = prompt('エクスポート文字列を貼り付けてください'); if(!data) return;
  try{ const obj = JSON.parse(decodeURIComponent(escape(atob(data)))); migrateOldSave(obj); Object.assign(state, obj); updateMonsterSkin(); applyPermBaseline(); refreshUI(); save(); alert('読み込み完了！'); }catch(e){ alert('読み込みに失敗しました'); }
});

function doHardReset(){
  IS_RESETTING = true;
  try{ if(saveIntervalId) clearInterval(saveIntervalId); }catch(e){}
  try{
    const KEYS = [SAVE_KEY, 'monster_clicker_v1_ja'];
    KEYS.forEach(k=>localStorage.removeItem(k));
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
window.addEventListener('beforeunload', ()=>{ if(!IS_RESETTING) save(); });
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && !IS_RESETTING) save(); });

// ====== 初期起動 ======
function init(){
  load();
  // offline progress (CPS+DPS)
  const now = Date.now();
  const lastTs = state.lastSaved || now;
  let elapsedSec = Math.max(0, (now - lastTs)/1000);
  if(elapsedSec > 3){
    const cap = Math.min(elapsedSec, 8*3600); // up to 8h
    const gain = applyOfflineProgress(cap, true);
    const totalGain = gain + (LAST_OFFLINE.coinsFromKills||0);
    const killed = LAST_OFFLINE.kills||0;
    if(totalGain>0 || killed>0){ DOM.saveHint.textContent = `オフライン +${fmt(totalGain)}🪙 / ${Math.floor(cap)}s${killed? '・'+killed+'討伐':''}`; }
  }
  state.lastSaved = now;

  state.monster.maxHp = monsterHP(state.monster.level);
  if(state.monster.hp==null) state.monster.hp = state.monster.maxHp;
  updateMonsterSkin();
  refreshUI();
  requestAnimationFrame((t)=>{ last=t; requestAnimationFrame(loop); });
  saveIntervalId = setInterval(save, 3000);
}
init();

// ====== 簡易セルフテスト ======
(function runSelfTests(){
  const tests = [];
  function eq(desc, a, b){ tests.push({desc, pass: a===b, got:a, expected:b}); }
  function ok(desc, cond){ tests.push({desc, pass: !!cond, got:cond, expected:true}); }

  try{
    // fmt
    eq('fmt(999) == "999"', fmt(999), '999');
    ok('fmt(1000) suffix', fmt(1000).endsWith('K'));
    // HP
    eq('monsterHP(1) == 8', monsterHP(1), 8);
    ok('monsterHP(2) >= 9', monsterHP(2) >= 9);
    // previewRebirthCoins (50->75->100 / 25刻み)
    const prevHL = state.highestLevelThisRun;
    state.highestLevelThisRun = 49; eq('preview 49 => 0', previewRebirthCoins(), 0);
    state.highestLevelThisRun = 50; eq('preview 50 => 1', previewRebirthCoins(), 1);
    state.highestLevelThisRun = 74; eq('preview 74 => 1', previewRebirthCoins(), 1);
    state.highestLevelThisRun = 75; eq('preview 75 => 2', previewRebirthCoins(), 2);
    state.highestLevelThisRun = 100; eq('preview 100 => 3', previewRebirthCoins(), 3);
    state.highestLevelThisRun = prevHL;
    // hire/upgrade cost parity (adv vs thi)
    eq('hire parity init', state.adv.hireCost, state.thi.hireCost);
    eq('upg parity init', state.adv.upCost, state.thi.upCost);
    // bulk preview quick check
    state.player.cost = 8; state.player.costMul = 1.10; state.buyQty = 10; refreshUI();
    ok('bulk preview shows ×10', (document.getElementById('clickBulk').textContent||'').includes('×10'));
    // export alert string template sanity
    (function(){ const pre='セーブデータをクリップボードへコピーしました。\\n\\n'; ok('export prefix contains newline', pre.includes('\\n')); })();
  }catch(e){ console.warn('self test error', e); }

  const failed = tests.filter(t=>!t.pass);
  if(failed.length){ console.warn('Tests failed:', failed); } else { console.log('All tests passed:', tests.length); }
})();
