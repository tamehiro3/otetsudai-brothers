// おてつだいブラザーズ - データ定義
// ポイント・ミッション・スタンプはすべてここで管理する

const KID_IDS = ["ani", "otouto"];

const KID_DEFAULTS = {
  ani:    { name: "おにいちゃん", emoji: "🦖" },
  otouto: { name: "おとうと",     emoji: "🦕" },
};

const MISSION_GROUPS = [
  { id: "daily",  label: "まいにちの おてつだい",        emoji: "☀️" },
  { id: "weekly", label: "しゅうに すうかいの おてつだい", emoji: "📅" },
  { id: "hard",   label: "ちょっと たいへんな おてつだい", emoji: "💪" },
];

// rotation:true のミッションは「担当チェンジ制」（月水金/火木土で交代・日曜は協力デー）
const MISSIONS = [
  // まいにち
  { id: "laundry_basket", group: "daily", name: "ぬいだものを せんたくかごへ", emoji: "🧺", pt: 10 },
  { id: "dishes",         group: "daily", name: "しょっきを さげる",           emoji: "🍽️", pt: 10 },
  { id: "shoes",          group: "daily", name: "くつを そろえる",             emoji: "👟", pt: 10 },
  { id: "desk_tidy",      group: "daily", name: "じぶんの つくえを かたづける", emoji: "📚", pt: 15 },
  { id: "prepare",        group: "daily", name: "あしたの じゅんびを する",     emoji: "🎒", pt: 20 },
  // しゅうにすうかい
  { id: "fold_laundry",   group: "weekly", name: "せんたくものを たたむ",   emoji: "👕", pt: 30 },
  { id: "trash",          group: "weekly", name: "ゴミだしの じゅんび",     emoji: "🗑️", pt: 30 },
  { id: "desk_wipe",      group: "weekly", name: "つくえふき",             emoji: "🧽", pt: 20, rotation: true },
  { id: "pet",            group: "weekly", name: "ペットの おせわ",         emoji: "🐶", pt: 30 },
  { id: "toilet",         group: "weekly", name: "トイレそうじ",           emoji: "🚽", pt: 50, rotation: true },
  // ちょっとたいへん
  { id: "bath",           group: "hard", name: "おふろそうじ",               emoji: "🛁", pt: 70 },
  { id: "carry",          group: "hard", name: "かいものの にもつもち",       emoji: "🛍️", pt: 40 },
  { id: "entrance",       group: "hard", name: "げんかんそうじ",             emoji: "🚪", pt: 40 },
  { id: "futon",          group: "hard", name: "かぞくの ふとんを ととのえる", emoji: "🛏️", pt: 40 },
];

// 兄弟ミッション：2人ぶんそろって承認されると協力スタンプ。週3回でボーナス50ptずつ
const COOP_BONUS_PT = 50;
const COOP_BONUS_TIMES = 3;
const COOP_MISSIONS = [
  {
    id: "coop_laundry", name: "せんたくコンビ", emoji: "🧺",
    tasks: {
      ani:    { name: "せんたくものを たたむ",       pt: 30 },
      otouto: { name: "ぬいだものを かごに いれる",   pt: 10 },
    },
  },
  {
    id: "coop_toilet", name: "トイレピカピカたい", emoji: "🚽",
    tasks: {
      ani:    { name: "トイレそうじ",                 pt: 50 },
      otouto: { name: "トイレットペーパーの ほじゅう", pt: 10 },
    },
  },
  {
    id: "coop_table", name: "しょくたくコンビ", emoji: "🍽️",
    tasks: {
      ani:    { name: "しょっきを さげる",   pt: 10 },
      otouto: { name: "テーブルを ふく",     pt: 10 },
    },
  },
];

// 個人スタンプ：対象ミッションが承認されるたびに1個たまる
const STAMP_DEFS = [
  { id: "st_laundry", name: "せんたくかごスタンプ",     emoji: "🧺", mission: "laundry_basket" },
  { id: "st_dish",    name: "しょっきスタンプ",         emoji: "🍽️", mission: "dishes" },
  { id: "st_shoes",   name: "くつそろえスタンプ",       emoji: "👟", mission: "shoes" },
  { id: "st_toilet",  name: "トイレぴかぴかスタンプ",   emoji: "✨", mission: "toilet" },
  { id: "st_bath",    name: "おふろたいちょうスタンプ", emoji: "🛁", mission: "bath" },
  { id: "st_prepare", name: "じゅんびばっちりスタンプ", emoji: "🎒", mission: "prepare" },
];

// 兄弟共有スタンプ
const SHARED_STAMP_DEFS = [
  { id: "ss_coop",    name: "ブラザーきょうりょく", emoji: "🤝", hint: "きょうりょくミッションを 2人で クリア" },
  { id: "ss_family",  name: "かぞくたすけたい",     emoji: "🦸", hint: "ちょっとたいへんな おてつだいを クリア" },
  { id: "ss_weekend", name: "しゅうまつチャレンジ", emoji: "🌈", hint: "どようび・にちようびに きょうりょく" },
  { id: "ss_thanks",  name: "ありがとうコンボ",     emoji: "💌", hint: "おうちのひとから ありがとうカードが とどく" },
];

// とくべつバッジ
const BADGE_DEFS = [
  { id: "morning_master", name: "あさのたつじん",       emoji: "🌅", hint: "せんたくかごに 7日 れんぞくで いれる" },
  { id: "toilet_master",  name: "トイレマスター",       emoji: "🏆", hint: "トイレそうじを 3回 クリア" },
];
const TOILET_MASTER_COUNT = 3;
const MORNING_MASTER_STREAK = 7;

// 家族イベント：兄弟合計（かせいだ累計pt）が300ptたまるごとにチケット1枚
const FAMILY_EVENT_PT = 300;

// ごほうびショップの初期ラインナップ（親画面で編集できる）
const DEFAULT_SHOP = [
  { id: "shop_game",  name: "ゲーム30ぷん けん",       emoji: "🎮", cost: 100 },
  { id: "shop_snack", name: "すきな おかし 1つ",       emoji: "🍭", cost: 80 },
  { id: "shop_menu",  name: "ばんごはん リクエストけん", emoji: "🍛", cost: 150 },
  { id: "shop_movie", name: "かぞくで えいがの よる",   emoji: "🍿", cost: 300 },
];

const DEFAULT_SETTINGS = {
  rateYenPerPt: 1,      // 1pt = 1円（0.1にすると10pt=1円）
  weeklyCap: 300,       // 1人あたり週の獲得上限（超えると親画面で警告）
  payday: "にちようび",  // 支払い日の表示用
  rotationFlip: false,  // 担当ローテーションの入れ替え
};
