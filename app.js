// おてつだいブラザーズ - アプリ本体
// データはぜんぶ端末の中（localStorage）。通信・課金・広告なし。

const STORE_KEY = "otetsudai_brothers_v1";

/* ---------- 状態 ---------- */

function defaultKid(id) {
  return {
    name: KID_DEFAULTS[id].name,
    emoji: KID_DEFAULTS[id].emoji,
    points: 0,
    ledger: [],        // {d, label, pt, kind: earn|bonus|spend|payout}
    stamps: {},        // {stampId: count}
    badges: [],        // [badgeId]
    streaks: {},       // {missionId: {last: "YYYY-MM-DD", n: 1}}
    counts: {},        // {missionId: 承認された回数}
    wishlist: [],      // {id, name, pt}
  };
}

function defaultState() {
  return {
    version: 1,
    setupDone: false,
    kids: { ani: defaultKid("ani"), otouto: defaultKid("otouto") },
    shared: {
      stamps: {},          // {sharedStampId: count}
      lifetimeEarned: 0,   // 兄弟合計のかせいだ累計pt（家族イベント用）
      coopLog: [],         // [{d}] ペア成立した協力ミッション
      bonusWeeks: {},      // {weekKey: true} 週3回ボーナス支給済み
      ticketsRedeemed: 0,  // つかった家族イベントチケット
    },
    pending: [],           // 承認待ち {id, kind, kid, date, label, pt, mid?, coopId?, itemId?, key}
    done: {},              // {date: {kid: {key: "pending"|"ok"}}}
    cards: [],             // ありがとうカード {id, kid, msg, pt, d, read}
    shop: DEFAULT_SHOP.map(x => ({ ...x })),
    settings: { ...DEFAULT_SETTINGS },
  };
}

function migrate(s) {
  const base = defaultState();
  const out = { ...base, ...s };
  out.kids = { ani: { ...defaultKid("ani"), ...(s.kids && s.kids.ani) }, otouto: { ...defaultKid("otouto"), ...(s.kids && s.kids.otouto) } };
  out.shared = { ...base.shared, ...(s.shared || {}) };
  out.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  // 2026-07-05: ゲーム30分けんを100pt→1000ptに修正（保存済みデータも追従させる）
  if (Array.isArray(out.shop)) {
    const g = out.shop.find(i => i.id === "shop_game");
    if (g && g.cost === 100) g.cost = 1000;
  }
  return out;
}

let state;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    state = raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch (e) {
    state = defaultState();
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// 画面の一時状態（保存しない）
const ui = { kid: null, childTab: "today", parentTab: "approve", gateQ: null };

/* ---------- 日付ユーティリティ ---------- */

const pad2 = n => String(n).padStart(2, "0");
function dateKey(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function todayKey() { return dateKey(new Date()); }
function noonOf(ds) { return new Date(ds + "T12:00:00"); }
function dowOf(ds) { return noonOf(ds).getDay(); } // 0=日
function prevDayKey(ds) { const d = noonOf(ds); d.setDate(d.getDate() - 1); return dateKey(d); }
function weekKeyOf(ds) { const d = noonOf(ds); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return dateKey(d); } // 月曜はじまり
const DOW_JA = ["にち", "げつ", "か", "すい", "もく", "きん", "ど"];

/* ---------- 汎用 ---------- */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const other = kid => (kid === "ani" ? "otouto" : "ani");
const kidName = id => state.kids[id].emoji + " " + state.kids[id].name;
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function yenOf(pt) { return Math.floor(pt * state.settings.rateYenPerPt); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- ドメインロジック ---------- */

const missionById = id => MISSIONS.find(m => m.id === id);
const coopById = id => COOP_MISSIONS.find(c => c.id === id);

// 担当ローテーション：月水金 / 火木土 で交代、日曜は協力デー
function rotationAssignee(mid, ds) {
  const dow = dowOf(ds);
  if (dow === 0) return null;
  const mwf = dow === 1 || dow === 3 || dow === 5;
  let toiletKid = mwf ? "ani" : "otouto";
  if (state.settings.rotationFlip) toiletKid = other(toiletKid);
  return mid === "toilet" ? toiletKid : other(toiletKid);
}

const keyMission = mid => "m:" + mid;
const keyCoop = cid => "c:" + cid;
const keyShop = iid => "s:" + iid;

function getDone(kid, key, ds) {
  ds = ds || todayKey();
  return state.done[ds] && state.done[ds][kid] && state.done[ds][kid][key];
}
function setDone(kid, key, ds, status) {
  if (!state.done[ds]) state.done[ds] = {};
  if (!state.done[ds][kid]) state.done[ds][kid] = {};
  state.done[ds][kid][key] = status;
}
function clearDone(kid, key, ds) {
  if (state.done[ds] && state.done[ds][kid]) delete state.done[ds][kid][key];
}

function weekEarned(kid, ds) {
  const wk = weekKeyOf(ds || todayKey());
  return state.kids[kid].ledger
    .filter(e => (e.kind === "earn" || e.kind === "bonus") && weekKeyOf(e.d) === wk)
    .reduce((a, e) => a + e.pt, 0);
}
function coopCountThisWeek(ds) {
  const wk = weekKeyOf(ds || todayKey());
  return state.shared.coopLog.filter(e => weekKeyOf(e.d) === wk).length;
}
function familyTickets() {
  return Math.floor(state.shared.lifetimeEarned / FAMILY_EVENT_PT) - state.shared.ticketsRedeemed;
}

/* ---------- 子ども側アクション ---------- */

function requestMission(kid, mid) {
  const m = missionById(mid);
  const key = keyMission(mid);
  if (getDone(kid, key)) return;
  const p = { id: uid(), kind: "mission", kid, date: todayKey(), label: m.emoji + " " + m.name, pt: m.pt, mid, key };
  state.pending.push(p);
  setDone(kid, key, p.date, "pending");
  save();
  toast("できた！を おくったよ。おうちのひとの OK を まってね 🙌");
  renderChild();
}

function requestCoop(kid, coopId) {
  const c = coopById(coopId);
  const key = keyCoop(coopId);
  if (getDone(kid, key)) return;
  const task = c.tasks[kid];
  const p = { id: uid(), kind: "coop", kid, date: todayKey(), label: c.emoji + " " + c.name + "「" + task.name + "」", pt: task.pt, coopId, key };
  state.pending.push(p);
  setDone(kid, key, p.date, "pending");
  save();
  toast("きょうりょくミッションを おくったよ！2人そろうと スタンプ 🤝");
  renderChild();
}

function requestShop(kid, itemId) {
  const item = state.shop.find(i => i.id === itemId);
  if (!item) return;
  const key = keyShop(itemId);
  if (getDone(kid, key)) return;
  if (state.kids[kid].points < item.cost) { toast("ポイントが まだ たりないよ"); return; }
  const p = { id: uid(), kind: "shop", kid, date: todayKey(), label: item.emoji + " " + item.name, pt: -item.cost, itemId, key };
  state.pending.push(p);
  setDone(kid, key, p.date, "pending");
  save();
  toast("こうかんを おねがいしたよ！おうちのひとの OK を まってね");
  renderChild();
}

/* ---------- 承認・却下（親） ---------- */

function earn(kid, pt, label, ds, kind) {
  state.kids[kid].points += pt;
  state.kids[kid].ledger.push({ d: ds, label, pt, kind });
  const before = Math.floor(state.shared.lifetimeEarned / FAMILY_EVENT_PT);
  state.shared.lifetimeEarned += pt;
  const after = Math.floor(state.shared.lifetimeEarned / FAMILY_EVENT_PT);
  if (after > before) toast("🎉 かぞくイベントチケット かくとく！（兄弟合計 " + after * FAMILY_EVENT_PT + "pt たっせい）");
}

function addSharedStamp(id) {
  state.shared.stamps[id] = (state.shared.stamps[id] || 0) + 1;
}

function giveBadge(kid, badgeId) {
  const k = state.kids[kid];
  if (!k.badges.includes(badgeId)) {
    k.badges.push(badgeId);
    const b = BADGE_DEFS.find(x => x.id === badgeId);
    toast("🏅 " + k.name + " が バッジ「" + b.name + "」を かくとく！");
  }
}

function afterMissionApproved(p) {
  const m = missionById(p.mid);
  const k = state.kids[p.kid];
  k.counts[p.mid] = (k.counts[p.mid] || 0) + 1;
  // 個人スタンプ
  const st = STAMP_DEFS.find(s => s.mission === p.mid);
  if (st) k.stamps[st.id] = (k.stamps[st.id] || 0) + 1;
  // 大変なおてつだい → 家族たすけ隊（共有）
  if (m.group === "hard") addSharedStamp("ss_family");
  // トイレ3回 → バッジ
  if (p.mid === "toilet" && k.counts[p.mid] >= TOILET_MASTER_COUNT) giveBadge(p.kid, "toilet_master");
  // 洗濯かご連続日数 → 朝の達人
  if (p.mid === "laundry_basket") {
    const s = k.streaks[p.mid] || { last: null, n: 0 };
    if (s.last === p.date) { /* 同日の重複はカウントしない */ }
    else if (s.last === prevDayKey(p.date)) { s.n += 1; s.last = p.date; }
    else { s.n = 1; s.last = p.date; }
    k.streaks[p.mid] = s;
    if (s.n >= MORNING_MASTER_STREAK) giveBadge(p.kid, "morning_master");
  }
}

function afterCoopApproved(p) {
  const partnerStatus = getDone(other(p.kid), keyCoop(p.coopId), p.date);
  if (partnerStatus !== "ok") return; // 相方待ち
  // ペア成立！
  addSharedStamp("ss_coop");
  const dow = dowOf(p.date);
  if (dow === 0 || dow === 6) addSharedStamp("ss_weekend");
  state.shared.coopLog.push({ d: p.date });
  toast("🤝 ブラザーきょうりょくスタンプ ゲット！");
  // 週3回で2人ともボーナス
  const wk = weekKeyOf(p.date);
  if (coopCountThisWeek(p.date) >= COOP_BONUS_TIMES && !state.shared.bonusWeeks[wk]) {
    state.shared.bonusWeeks[wk] = true;
    KID_IDS.forEach(kid => earn(kid, COOP_BONUS_PT, "🎁 きょうりょくボーナス（週" + COOP_BONUS_TIMES + "回たっせい）", p.date, "bonus"));
    toast("🎉 こんしゅう " + COOP_BONUS_TIMES + "回 きょうりょくたっせい！2人に " + COOP_BONUS_PT + "pt ボーナス！");
  }
}

function approveItem(id) {
  const i = state.pending.findIndex(p => p.id === id);
  if (i < 0) return;
  const p = state.pending[i];
  state.pending.splice(i, 1);
  if (p.kind === "shop") {
    const k = state.kids[p.kid];
    const cost = -p.pt;
    if (k.points < cost) {
      clearDone(p.kid, p.key, p.date);
      toast("ポイントが たりないため こうかんできませんでした");
    } else {
      k.points -= cost;
      k.ledger.push({ d: todayKey(), label: "こうかん " + p.label, pt: -cost, kind: "spend" });
      setDone(p.kid, p.key, p.date, "ok");
    }
  } else {
    earn(p.kid, p.pt, p.label, p.date, "earn");
    setDone(p.kid, p.key, p.date, "ok");
    if (p.kind === "mission") afterMissionApproved(p);
    if (p.kind === "coop") afterCoopApproved(p);
  }
  save();
  renderParent();
}

function rejectItem(id) {
  const i = state.pending.findIndex(p => p.id === id);
  if (i < 0) return;
  const p = state.pending[i];
  state.pending.splice(i, 1);
  clearDone(p.kid, p.key, p.date);
  save();
  toast("さしもどしました（もういちど チャレンジできます）");
  renderParent();
}

/* ---------- 画面切り替え ---------- */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  window.scrollTo(0, 0);
}

/* ---------- ホーム（だれ？） ---------- */

function renderSelect() {
  $("sel-kids").innerHTML = KID_IDS.map(id => `
    <button class="kid-btn" data-act="selectKid" data-kid="${id}">
      <span class="kid-emoji">${state.kids[id].emoji}</span>
      <span class="kid-name">${esc(state.kids[id].name)}</span>
      <span class="kid-pt">${state.kids[id].points}pt</span>
    </button>`).join("");
  const next = FAMILY_EVENT_PT - (state.shared.lifetimeEarned % FAMILY_EVENT_PT);
  const tickets = familyTickets();
  $("sel-family").innerHTML = `
    <div class="family-bar">
      <div>👨‍👩‍👦‍👦 兄弟ごうけい <b>${state.shared.lifetimeEarned}pt</b></div>
      <div class="bar"><div class="bar-in" style="width:${Math.floor((state.shared.lifetimeEarned % FAMILY_EVENT_PT) / FAMILY_EVENT_PT * 100)}%"></div></div>
      <div class="family-note">あと <b>${next}pt</b> で かぞくイベント${tickets > 0 ? `　🎟️ チケット <b>${tickets}まい</b> もってるよ！` : ""}</div>
    </div>`;
  showScreen("scr-select");
}

/* ---------- はじめての設定 ---------- */

function renderSetup() {
  $("setup-ani").value = state.kids.ani.name;
  $("setup-otouto").value = state.kids.otouto.name;
  showScreen("scr-setup");
}

/* ---------- 子ども画面 ---------- */

function nudges(kid) {
  const list = [];
  const k = state.kids[kid];
  const coop = coopCountThisWeek();
  if (coop === COOP_BONUS_TIMES - 1 && !state.shared.bonusWeeks[weekKeyOf(todayKey())])
    list.push("🔥 あと1回 きょうりょくすると 2人に " + COOP_BONUS_PT + "pt ボーナス！");
  const tCount = k.counts["toilet"] || 0;
  if (tCount > 0 && tCount < TOILET_MASTER_COUNT && !k.badges.includes("toilet_master"))
    list.push("🚽 トイレそうじ あと" + (TOILET_MASTER_COUNT - tCount) + "回で「トイレマスター」バッジ！");
  const st = k.streaks["laundry_basket"];
  if (st && st.n >= 3 && st.n < MORNING_MASTER_STREAK && (st.last === todayKey() || st.last === prevDayKey(todayKey())))
    list.push("🧺 せんたくかご れんぞく" + st.n + "日！ あと" + (MORNING_MASTER_STREAK - st.n) + "日で「あさのたつじん」！");
  const next = FAMILY_EVENT_PT - (state.shared.lifetimeEarned % FAMILY_EVENT_PT);
  if (next <= 60) list.push("🎟️ あと" + next + "ptで かぞくイベント かいほう！");
  if (dowOf(todayKey()) === 0) list.push("🌈 きょうは にちようび！きょうりょくデーだよ");
  if (!list.length) list.push("☀️ きょうも おてつだい ありがとう！");
  return list.slice(0, 2);
}

function missionBtn(kid, key, extra) {
  const st = getDone(kid, key);
  if (st === "ok") return `<span class="stat ok">OKずみ ✅</span>`;
  if (st === "pending") return `<span class="stat wait">しんせいちゅう ⏳</span>`;
  return `<button class="btn-done" data-act="${extra.act}" data-kid="${kid}" data-id="${extra.id}">できた！</button>`;
}

function renderChildToday(kid) {
  const ds = todayKey();
  const dow = dowOf(ds);
  const unread = state.cards.filter(c => c.kid === kid && !c.read).length;
  let html = "";
  if (unread) html += `<button class="card-alert" data-act="childTab" data-tab="stamps">💌 あたらしい ありがとうカードが ${unread}まい とどいてるよ！みてみよう →</button>`;
  html += `<div class="nudge">${nudges(kid).map(n => `<div>${n}</div>`).join("")}</div>`;

  // きょうの担当（ローテーション）
  if (dow === 0) {
    html += `<div class="rota">🌈 きょうは <b>きょうりょくデー</b>！「きょうりょく」タブで 2人ミッションに チャレンジ！</div>`;
  } else {
    const rota = MISSIONS.filter(m => m.rotation).map(m => `${m.emoji}${m.name} → <b>${esc(state.kids[rotationAssignee(m.id, ds)].name)}</b>`).join("　");
    html += `<div class="rota">🔁 きょう（${DOW_JA[dow]}ようび）の とうばん：${rota}</div>`;
  }

  for (const g of MISSION_GROUPS) {
    const ms = MISSIONS.filter(m => m.group === g.id).filter(m => {
      if (m.assignee) return m.assignee === kid; // 固定担当の子だけに表示（毎日）
      if (!m.rotation) return true;
      return rotationAssignee(m.id, ds) === kid; // 担当の子だけに表示、日曜は非表示
    });
    if (!ms.length) continue;
    html += `<h3 class="grp">${g.emoji} ${g.label}</h3>`;
    html += ms.map(m => `
      <div class="mission">
        <span class="m-emoji">${m.emoji}</span>
        <span class="m-name">${m.name}${m.rotation ? ' <span class="tag">とうばん</span>' : ""}${m.assignee ? ' <span class="tag">たんとう</span>' : ""}</span>
        <span class="m-pt">${m.pt}pt</span>
        ${missionBtn(kid, keyMission(m.id), { act: "doMission", id: m.id })}
      </div>`).join("");
  }
  return html;
}

function renderChildCoop(kid) {
  const wkCount = coopCountThisWeek();
  const bonusDone = state.shared.bonusWeeks[weekKeyOf(todayKey())];
  let html = `
    <div class="nudge">
      🤝 2人とも できて OK が出ると「ブラザーきょうりょくスタンプ」！<br>
      こんしゅうの きょうりょく：<b>${Math.min(wkCount, COOP_BONUS_TIMES)}/${COOP_BONUS_TIMES}回</b>
      ${bonusDone ? "　🎉 ボーナスゲットずみ！" : `　（${COOP_BONUS_TIMES}回で 2人に ${COOP_BONUS_PT}ptボーナス）`}
    </div>`;
  html += COOP_MISSIONS.map(c => {
    const rows = KID_IDS.map(id => {
      const t = c.tasks[id];
      const isMe = id === kid;
      const st = getDone(id, keyCoop(c.id));
      let right;
      if (isMe) right = missionBtn(kid, keyCoop(c.id), { act: "doCoop", id: c.id });
      else right = st === "ok" ? `<span class="stat ok">OKずみ ✅</span>` : st === "pending" ? `<span class="stat wait">しんせいちゅう ⏳</span>` : `<span class="stat">まだ</span>`;
      return `<div class="coop-row${isMe ? " me" : ""}">
        <span class="m-emoji">${state.kids[id].emoji}</span>
        <span class="m-name"><b>${esc(state.kids[id].name)}</b>：${t.name}</span>
        <span class="m-pt">${t.pt}pt</span>${right}</div>`;
    }).join("");
    return `<div class="coop-card"><div class="coop-title">${c.emoji} ${c.name}</div>${rows}</div>`;
  }).join("");
  return html;
}

function renderChildStamps(kid) {
  const k = state.kids[kid];
  let html = `<h3 class="grp">📖 ${esc(k.name)}の スタンプちょう</h3><div class="stamp-grid">`;
  html += STAMP_DEFS.map(s => {
    const n = k.stamps[s.id] || 0;
    return `<div class="stamp${n ? "" : " none"}"><span class="s-emoji">${s.emoji}</span><span class="s-name">${s.name}</span><span class="s-n">×${n}</span></div>`;
  }).join("");
  html += `</div><h3 class="grp">🏅 とくべつバッジ</h3><div class="stamp-grid">`;
  html += BADGE_DEFS.map(b => {
    const got = k.badges.includes(b.id);
    return `<div class="stamp${got ? " badge" : " none"}"><span class="s-emoji">${got ? b.emoji : "🔒"}</span><span class="s-name">${b.name}</span><span class="s-n">${got ? "かくとく！" : b.hint}</span></div>`;
  }).join("");
  html += `</div><h3 class="grp">🤝 兄弟きょうゆうスタンプ（2人のもの）</h3><div class="stamp-grid">`;
  html += SHARED_STAMP_DEFS.map(s => {
    const n = state.shared.stamps[s.id] || 0;
    return `<div class="stamp shared${n ? "" : " none"}"><span class="s-emoji">${s.emoji}</span><span class="s-name">${s.name}</span><span class="s-n">×${n}<br><small>${s.hint}</small></span></div>`;
  }).join("");
  html += `</div>`;
  const myCards = state.cards.filter(c => c.kid === kid);
  html += `<h3 class="grp">💌 とどいた ありがとうカード</h3>`;
  if (!myCards.length) html += `<div class="empty">まだ ないよ。おてつだいを がんばると とどくかも！</div>`;
  else html += myCards.slice().reverse().map(c => `
    <div class="thanks-card${c.read ? "" : " unread"}" data-act="readCard" data-id="${c.id}">
      <div class="tc-head">💌 ${c.d}${c.pt ? `　<b>+${c.pt}pt</b>` : ""}${c.read ? "" : '　<span class="new">NEW</span>'}</div>
      <div class="tc-msg">${esc(c.msg)}</div>
    </div>`).join("");
  return html;
}

function renderChildBank(kid) {
  const k = state.kids[kid];
  const we = weekEarned(kid);
  const cap = state.settings.weeklyCap;
  let html = `
    <div class="bank-top">
      <div class="bank-balance">${k.points}<span class="unit">pt</span></div>
      <div class="bank-yen">いま こうかんすると 約 <b>${yenOf(k.points)}円</b>（しはらい日：${esc(state.settings.payday)}）</div>
      <div class="bank-week">こんしゅう かせいだ：<b>${we}pt</b> / 上限 ${cap}pt</div>
      <div class="bar"><div class="bar-in" style="width:${Math.min(100, Math.floor(we / cap * 100))}%"></div></div>
    </div>
    <h3 class="grp">📒 つうちょう きろく</h3>`;
  const rows = k.ledger.slice(-30).reverse();
  if (!rows.length) html += `<div class="empty">まだ きろくが ないよ。「できた！」から はじめよう！</div>`;
  else html += `<table class="ledger">` + rows.map(e =>
    `<tr><td class="l-date">${e.d.slice(5)}</td><td>${esc(e.label)}</td><td class="l-pt ${e.pt >= 0 ? "plus" : "minus"}">${e.pt >= 0 ? "+" : ""}${e.pt}</td></tr>`).join("") + `</table>`;
  return html;
}

function renderChildWish(kid) {
  const k = state.kids[kid];
  let html = `<h3 class="grp">🛒 ごほうびショップ</h3>`;
  if (!state.shop.length) html += `<div class="empty">いまは しょうひんが ないよ</div>`;
  html += state.shop.map(item => {
    const st = getDone(kid, keyShop(item.id));
    let right;
    if (st === "pending") right = `<span class="stat wait">おねがいちゅう ⏳</span>`;
    else if (st === "ok") right = `<span class="stat ok">こうかんずみ ✅</span>`;
    else if (k.points >= item.cost) right = `<button class="btn-done buy" data-act="buyItem" data-kid="${kid}" data-id="${item.id}">こうかんする</button>`;
    else right = `<span class="stat">あと${item.cost - k.points}pt</span>`;
    return `<div class="mission"><span class="m-emoji">${item.emoji}</span><span class="m-name">${esc(item.name)}</span><span class="m-pt">${item.cost}pt</span>${right}</div>`;
  }).join("");
  html += `<h3 class="grp">⭐ ほしいものリスト（じぶんの もくひょう）</h3>`;
  html += k.wishlist.map(w => {
    const pct = Math.min(100, Math.floor(k.points / w.pt * 100));
    return `<div class="wish">
      <div class="wish-head"><span>${esc(w.name)}</span><span>${w.pt}pt</span>
        <button class="btn-x" data-act="delWish" data-kid="${kid}" data-id="${w.id}">✕</button></div>
      <div class="bar"><div class="bar-in" style="width:${pct}%"></div></div>
      <div class="wish-note">${pct >= 100 ? "🎉 とどいたよ！こうかんを おねがいしてみよう" : "たっせいど " + pct + "%"}</div>
    </div>`;
  }).join("");
  html += `
    <div class="wish-add">
      <input id="wish-name" placeholder="ほしいもの（れい：カードパック）" maxlength="30">
      <input id="wish-pt" type="number" inputmode="numeric" placeholder="pt" min="1">
      <button class="btn-done" data-act="addWish" data-kid="${kid}">ついか</button>
    </div>`;
  return html;
}

function renderChild() {
  const kid = ui.kid;
  if (!kid) { renderSelect(); return; }
  const k = state.kids[kid];
  $("child-title").innerHTML = `${k.emoji} ${esc(k.name)}`;
  $("child-pt").textContent = k.points + "pt";
  const tabs = { today: renderChildToday, coop: renderChildCoop, stamps: renderChildStamps, bank: renderChildBank, wish: renderChildWish };
  $("child-body").innerHTML = tabs[ui.childTab](kid);
  document.querySelectorAll("#child-nav [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === ui.childTab));
  showScreen("scr-child");
}

/* ---------- 親ゲート（かけ算） ---------- */

function renderGate() {
  const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8);
  ui.gateQ = a * b;
  $("gate-q").textContent = `${a} × ${b} = ?`;
  $("gate-in").value = "";
  showScreen("scr-gate");
  setTimeout(() => $("gate-in").focus(), 50);
}

/* ---------- 親画面 ---------- */

function renderParentApprove() {
  let html = "";
  if (!state.pending.length) html += `<div class="empty">承認待ちはありません 🎉</div>`;
  else html += state.pending.map(p => {
    const capWarn = p.kind !== "shop" && weekEarned(p.kid, p.date) + p.pt > state.settings.weeklyCap
      ? `<div class="warn">⚠️ 承認すると今週の上限 ${state.settings.weeklyCap}pt を超えます（現在 ${weekEarned(p.kid, p.date)}pt）</div>` : "";
    return `<div class="appr">
      <div class="appr-head"><b>${kidName(p.kid)}</b>　<span class="l-date">${p.date}</span></div>
      <div class="appr-body">${esc(p.label)}　<b class="${p.pt >= 0 ? "plus" : "minus"}">${p.pt >= 0 ? "+" : ""}${p.pt}pt</b></div>
      ${capWarn}
      <div class="appr-btns">
        <button class="btn-ok" data-act="approve" data-id="${p.id}">OK！</button>
        <button class="btn-ng" data-act="reject" data-id="${p.id}">さしもどす</button>
      </div>
    </div>`;
  }).join("");
  const tickets = familyTickets();
  html += `<h3 class="grp">🎟️ 家族イベントチケット：${tickets}枚</h3>
    <div class="p-note">兄弟合計 ${state.shared.lifetimeEarned}pt（${FAMILY_EVENT_PT}pt ごとに1枚）</div>
    ${tickets > 0 ? `<button class="btn-sub" data-act="useTicket">1枚つかった（イベント実施）</button>` : ""}`;
  return html;
}

function renderParentCard() {
  let html = `
    <h3 class="grp">💌 ありがとうカードを送る</h3>
    <div class="p-note">「よくがんばったポイント」もここから手動で追加できます（承認不要で即反映）。</div>
    <div class="form">
      <div class="radio-row">${KID_IDS.map((id, i) => `
        <label><input type="radio" name="card-kid" value="${id}" ${i === 0 ? "checked" : ""}> ${kidName(id)}</label>`).join("")}
      </div>
      <textarea id="card-msg" rows="3" placeholder="メッセージ（れい：トイレそうじ ピカピカで びっくりしたよ！ありがとう）"></textarea>
      <input id="card-pt" type="number" inputmode="numeric" placeholder="ボーナスpt（0でもOK）" min="0" value="0">
      <button class="btn-ok" data-act="sendCard">送る（ありがとうコンボスタンプ +1）</button>
    </div>
    <h3 class="grp">送ったカード</h3>`;
  if (!state.cards.length) html += `<div class="empty">まだありません</div>`;
  else html += state.cards.slice(-10).reverse().map(c =>
    `<div class="thanks-card"><div class="tc-head">→ ${kidName(c.kid)}　${c.d}${c.pt ? `　+${c.pt}pt` : ""}</div><div class="tc-msg">${esc(c.msg)}</div></div>`).join("");
  return html;
}

function renderParentShop() {
  let html = `<h3 class="grp">🛒 ごほうびショップの商品</h3>`;
  html += state.shop.map(i => `
    <div class="mission"><span class="m-emoji">${i.emoji}</span><span class="m-name">${esc(i.name)}</span><span class="m-pt">${i.cost}pt（約${yenOf(i.cost)}円）</span>
      <button class="btn-x" data-act="delShopItem" data-id="${i.id}">✕</button></div>`).join("");
  html += `
    <div class="form">
      <input id="shop-name" placeholder="商品名（れい：公園でキャッチボール30分）" maxlength="30">
      <input id="shop-cost" type="number" inputmode="numeric" placeholder="必要pt" min="1">
      <button class="btn-ok" data-act="addShopItem">商品を追加</button>
    </div>
    <div class="p-note">💡 モノだけでなく「一緒に遊ぶ時間」系のごほうびが続きやすいです。</div>`;
  return html;
}

function renderParentSettings() {
  const s = state.settings;
  let html = `
    <h3 class="grp">👦 なまえ</h3>
    <div class="form">
      <label>兄：<input id="set-ani" value="${esc(state.kids.ani.name)}" maxlength="10"></label>
      <label>弟：<input id="set-otouto" value="${esc(state.kids.otouto.name)}" maxlength="10"></label>
    </div>
    <h3 class="grp">💰 おこづかい設定</h3>
    <div class="form">
      <label>換金レート：
        <select id="set-rate">
          <option value="1" ${s.rateYenPerPt === 1 ? "selected" : ""}>1pt = 1円</option>
          <option value="0.1" ${s.rateYenPerPt === 0.1 ? "selected" : ""}>10pt = 1円</option>
        </select></label>
      <label>週の獲得上限（1人あたり）：<input id="set-cap" type="number" min="10" value="${s.weeklyCap}"> pt
        <span class="p-note">超えても承認はできます（親画面に警告表示）</span></label>
      <label>支払い日：
        <select id="set-payday">
          <option ${s.payday === "にちようび" ? "selected" : ""}>にちようび</option>
          <option ${s.payday === "げつまつ" ? "selected" : ""}>げつまつ</option>
        </select></label>
      <label><input type="checkbox" id="set-flip" ${s.rotationFlip ? "checked" : ""}> 担当ローテーションを入れ替える
        <span class="p-note">机ふきの とうばん：OFF＝月水金は弟・火木土は兄。ONで逆になります。トイレそうじは おにいちゃんの固定たんとうです。日曜は協力デー。</span></label>
      <button class="btn-ok" data-act="saveSettings">設定を保存</button>
    </div>
    <h3 class="grp">💸 おこづかい支払いの記録</h3>`;
  html += KID_IDS.map(id => {
    const k = state.kids[id];
    return `<div class="form pay">
      <div>${kidName(id)}：<b>${k.points}pt</b>（約${yenOf(k.points)}円）</div>
      <div class="pay-row"><input id="pay-${id}" type="number" inputmode="numeric" placeholder="支払うpt" min="1" max="${k.points}">
      <button class="btn-sub" data-act="payout" data-kid="${id}">支払い記録</button></div>
    </div>`;
  }).join("");
  html += `
    <h3 class="grp">🗂️ データ</h3>
    <div class="form">
      <button class="btn-sub" data-act="exportData">バックアップを保存（JSON）</button>
      <label class="btn-sub file-btn">バックアップから復元<input type="file" id="import-file" accept=".json" hidden></label>
      <button class="btn-ng" data-act="resetData">全データをリセット</button>
      <div class="p-note">データはこの端末の中だけに保存されます。機種変更前にバックアップを保存してください。</div>
    </div>`;
  return html;
}

function renderParent() {
  const tabs = { approve: renderParentApprove, card: renderParentCard, shop: renderParentShop, settings: renderParentSettings };
  $("parent-body").innerHTML = tabs[ui.parentTab]();
  $("parent-badge").textContent = state.pending.length ? state.pending.length : "";
  document.querySelectorAll("#parent-nav [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === ui.parentTab));
  const f = $("import-file");
  if (f) f.addEventListener("change", importData);
  showScreen("scr-parent");
}

/* ---------- データ入出力 ---------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "otetsudai_backup_" + todayKey() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("バックアップを保存しました");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      if (!parsed.kids || !parsed.kids.ani) throw new Error("形式が違います");
      state = migrate(parsed);
      save();
      toast("復元しました");
      renderParent();
    } catch (err) {
      toast("復元できませんでした：" + err.message);
    }
  };
  r.readAsText(file);
}

/* ---------- アクション ---------- */

const ACTIONS = {
  setupStart() {
    const a = $("setup-ani").value.trim(), o = $("setup-otouto").value.trim();
    if (a) state.kids.ani.name = a;
    if (o) state.kids.otouto.name = o;
    state.setupDone = true;
    save();
    renderSelect();
  },
  selectKid(d) { ui.kid = d.kid; ui.childTab = "today"; renderChild(); },
  gotoParent() { renderGate(); },
  gateCheck() {
    if (parseInt($("gate-in").value, 10) === ui.gateQ) { ui.parentTab = "approve"; renderParent(); }
    else { toast("ちがうよ！おうちのひとに きいてね"); renderGate(); }
  },
  backHome() { ui.kid = null; renderSelect(); },
  childTab(d) { ui.childTab = d.tab; renderChild(); },
  parentTab(d) { ui.parentTab = d.tab; renderParent(); },
  doMission(d) { requestMission(d.kid, d.id); },
  doCoop(d) { requestCoop(d.kid, d.id); },
  buyItem(d) { requestShop(d.kid, d.id); },
  addWish(d) {
    const name = $("wish-name").value.trim();
    const pt = parseInt($("wish-pt").value, 10);
    if (!name || !pt || pt < 1) { toast("なまえと pt を いれてね"); return; }
    state.kids[d.kid].wishlist.push({ id: uid(), name, pt });
    save(); renderChild();
  },
  delWish(d) {
    const k = state.kids[d.kid];
    k.wishlist = k.wishlist.filter(w => w.id !== d.id);
    save(); renderChild();
  },
  readCard(d) {
    const c = state.cards.find(c => c.id === d.id);
    if (c && !c.read) { c.read = true; save(); renderChild(); }
  },
  approve(d) { approveItem(d.id); },
  reject(d) { rejectItem(d.id); },
  useTicket() {
    if (familyTickets() < 1) return;
    state.shared.ticketsRedeemed += 1;
    save(); toast("チケットを1枚つかいました。楽しんできてください！🎉"); renderParent();
  },
  sendCard() {
    const kid = document.querySelector('input[name="card-kid"]:checked').value;
    const msg = $("card-msg").value.trim();
    const pt = Math.max(0, parseInt($("card-pt").value, 10) || 0);
    if (!msg) { toast("メッセージを入れてください"); return; }
    state.cards.push({ id: uid(), kid, msg, pt, d: todayKey(), read: false });
    if (pt > 0) earn(kid, pt, "💌 ありがとうカード", todayKey(), "bonus");
    addSharedStamp("ss_thanks");
    save(); toast("カードを送りました 💌"); renderParent();
  },
  addShopItem() {
    const name = $("shop-name").value.trim();
    const cost = parseInt($("shop-cost").value, 10);
    if (!name || !cost || cost < 1) { toast("商品名と pt を入れてください"); return; }
    state.shop.push({ id: "item_" + uid(), name, emoji: "🎁", cost });
    save(); renderParent();
  },
  delShopItem(d) {
    state.shop = state.shop.filter(i => i.id !== d.id);
    save(); renderParent();
  },
  saveSettings() {
    const a = $("set-ani").value.trim(), o = $("set-otouto").value.trim();
    if (a) state.kids.ani.name = a;
    if (o) state.kids.otouto.name = o;
    state.settings.rateYenPerPt = parseFloat($("set-rate").value);
    state.settings.weeklyCap = Math.max(10, parseInt($("set-cap").value, 10) || DEFAULT_SETTINGS.weeklyCap);
    state.settings.payday = $("set-payday").value;
    state.settings.rotationFlip = $("set-flip").checked;
    save(); toast("設定を保存しました"); renderParent();
  },
  payout(d) {
    const k = state.kids[d.kid];
    const pt = parseInt($("pay-" + d.kid).value, 10);
    if (!pt || pt < 1) { toast("支払うptを入れてください"); return; }
    if (pt > k.points) { toast("残高が足りません"); return; }
    k.points -= pt;
    k.ledger.push({ d: todayKey(), label: "💸 おこづかい しはらい（" + yenOf(pt) + "円）", pt: -pt, kind: "payout" });
    save(); toast(k.name + " に " + yenOf(pt) + "円 支払いを記録しました"); renderParent();
  },
  exportData() { exportData(); },
  resetData() {
    if (!confirm("本当に全データを消しますか？ポイント・スタンプ・記録がすべて消えます。")) return;
    localStorage.removeItem(STORE_KEY);
    state = defaultState();
    renderSetup();
  },
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.activeElement && document.activeElement.id === "gate-in") ACTIONS.gateCheck();
});

/* ---------- 起動 ---------- */

load();
if (state.setupDone) renderSelect();
else renderSetup();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
