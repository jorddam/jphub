// Every app in one list. Adding a station = adding one entry here.
// kind: "hub" = a page of this hub, "web" = another site of Jordan's, "claude" = a Claude artifact
// (kept there because it needs Claude on every use), "pc" = a local app opened by the trampoline.

export const LAUNCH = "go.html#";

export const LINES = [
  { id: "M", ja: "毎日線", sub: "毎日ひと回り。読んで、聞いて、記録する" },
  { id: "R", ja: "練習線", sub: "短い空き時間に。書く・打つ・話す" },
  { id: "J", ja: "じっくり線", sub: "時間のある夜や週末に、腰をすえて" },
  { id: "H", ja: "本棚線", sub: "次に読むもの・遊ぶものを選ぶ" },
];
export const DEPOT = "S";

export const STATIONS = [
  // 毎日線
  { line: "M", id: "articles", name: "今日の5本", en: "Daily five articles", blurb: "毎朝届く5本の記事を読んで、既読をつける", skill: "読む", kind: "hub", url: "articles/" },
  { line: "M", id: "gyokan", name: "行間", en: "Gyokan · ebook reader", blurb: "電子書籍を読んで、書き抜きとメモを残す", skill: "読む", kind: "web", url: "https://jorddam.github.io/gyokan/" },
  { line: "M", id: "kikitori", name: "聞き取り", en: "Kikitori · listening & shadowing", blurb: "YouTubeや音声を字幕つきで聞いて、シャドーイング", skill: "聞く", kind: "web", url: "https://jorddam.github.io/kikitori/" },
  { line: "M", id: "notebook", name: "ノート", en: "Notebook · everything you've noted", blurb: "書き抜き・単語・文法・メモをひとつにまとめて読み返す", skill: "復習", kind: "hub", url: "notebook/" },
  { line: "M", id: "hiroicho", name: "拾い帳", en: "Hiroichō · capture & study", blurb: "拾った単語・文法・文をカードにして復習する", skill: "復習", kind: "claude", url: "https://claude.ai/artifact/8RBjhsgeMq7ESbrkAy7g5C" },
  { line: "M", id: "media-score", name: "Daily Media Score", en: "Today's media, scored from Todoist", blurb: "今日読んだ・聞いた・遊んだ分を点数と連続日数で記録", skill: "記録", kind: "claude", url: "https://claude.ai/artifact/MCHA1E7BxRzyz19AeQdhsm" },
  { line: "M", id: "nihongo-dial", name: "Nihongo Dial", en: "Podcast episode picker", blurb: "1,063話から3本引いて、今日の1本を選ぶ", skill: "聞く", kind: "claude", url: "https://claude.ai/artifact/Q7P25CPY8z53LwibAwGEbb" },

  // 練習線
  { line: "R", id: "kotodama", name: "言霊", en: "Kotodama · typing defense", blurb: "読みを打って、神社に迫る敵を倒す", skill: "語彙", kind: "claude", url: "https://claude.ai/artifact/LYM8YRSgkuzEE3oYu37aHQ", level: "N5–N1" },
  { line: "R", id: "bunbun", name: "ぶんぶんブラスター", en: "Speed-writing combo game", blurb: "日本語をどんどん書いて、コンボをつなぐ", skill: "書く", kind: "claude", url: "https://claude.ai/artifact/By45HMitBkTQpaL73jc82G" },
  { line: "R", id: "yobanashi", name: "夜話", en: "Yobanashi · rooftop group chat", blurb: "屋上の5人とおしゃべり。送った文が星座になる", skill: "会話", kind: "claude", url: "https://claude.ai/artifact/TDLcQMTN7i9whpwbdGKYQJ", level: "N3–N2" },
  { line: "R", id: "bunkeicho", name: "文型帳", en: "Grammar notebook", blurb: "しばらく触れていない文法項目を見直す", skill: "文法", kind: "claude", url: "https://claude.ai/artifact/7L5nNJvCRUHtpKRynaXnY2" },
  { line: "R", id: "bunkai", name: "文の分解図", en: "Sentence breakdown", blurb: "読んでいる文を貼って、部分ごとに確かめる", skill: "読む", kind: "claude", url: "https://claude.ai/artifact/7WuPiNtyYxqKKQRapD8iHv" },

  // じっくり線
  { line: "J", id: "shizume", sub: "ホラーRPG · Claudeが進行役", name: "鎮目町 ― 霧の底 ―", en: "Shizume Town · solo horror RPG", blurb: "1988年12月、霧に沈む町で7日間", skill: "物語", kind: "claude", url: "https://claude.ai/artifact/DWHoxd1krPhRsJJW9jSpkU", level: "N2" },
  { line: "J", id: "beacon", name: "光なき灯台", en: "The Lightless Beacon · CoC", blurb: "1926年、明かりの消えた灯台の島", skill: "物語", kind: "claude", url: "https://claude.ai/artifact/TCt4HCpddhhCHUy9Wh6sgg", level: "N2" },
  { line: "J", id: "darkturns", name: "闇の曲がり角", en: "Dead Light & Other Dark Turns · CoC", blurb: "1927年、嵐の夜から始まる二章", skill: "物語", kind: "claude", url: "https://claude.ai/artifact/WbmN2b311cUWCynS1Pdzdm", level: "N2" },
  { line: "J", id: "casefiles", sub: "工学", name: "工学ケースファイル", en: "Engineering Casefiles", blurb: "週に一度の工学問題を解いて、宇宙船を造っていく", skill: "読む", note: "週1回", kind: "pc", launch: "casefiles" },

  // 本棚線
  { line: "H", id: "library", name: "ライブラリ", en: "Library · every media type", blurb: "本・マンガ・ゲーム・ウェブ小説・音声・動画の一覧と状態", skill: "選ぶ", kind: "hub", url: "library/" },
  { line: "H", id: "tsundoku", name: "積読の棚", en: "Tsundoku Shelf", blurb: "手持ちの本・漫画・ゲームから選んだ今の候補", skill: "選ぶ", note: "月・木に入れ替え", kind: "claude", url: "https://claude.ai/artifact/WHCjU3BvWajmrbQ7wHqSn1" },
  { line: "H", id: "tsugi", name: "次の一冊", en: "Book finder · AI picker", blurb: "レベルと気分から、次に読む本を絞り込む", skill: "選ぶ", kind: "claude", url: "https://claude.ai/artifact/SbP6kVYxMH572m9FYKbYfT", level: "N5–N0" },
  { line: "H", id: "tsugi-game", name: "次の一本", en: "Game picker", blurb: "Steamライブラリから、続きか次の一本を選ぶ", skill: "選ぶ", kind: "claude", url: "https://claude.ai/artifact/MgncGb8oNa1QtdCga3Eono" },

  // 書庫（資料とリスト）
  { line: "S", id: "merit200", name: "文学的価値 上位200", en: "Literary Merit Top 200", blurb: "手持ち・欲しい本・名作を採点した上位200冊", kind: "claude", url: "https://claude.ai/artifact/BqRDR4HhdLtjaTHksuG5UU" },
  { line: "S", id: "novels100", name: "日本の小説 トップ100", en: "Japanese Novels Top 100", blurb: "日本語の小説を集めたトップ100", kind: "claude", url: "https://claude.ai/artifact/ScYwpuoBvQ9axdGNYK89P8" },
  { line: "S", id: "meicho100", name: "日本の名著百選", en: "100 books by cultural weight", blurb: "古事記からコンビニ人間まで", kind: "claude", url: "https://claude.ai/artifact/GnfFnNxAxmX9cuWpdCe5DP" },
  { line: "S", id: "webnovel50", name: "ウェブ小説50選", en: "Web fiction shortlist", blurb: "レベルつきのウェブ小説50作と控え11作", kind: "claude", url: "https://claude.ai/artifact/66Npmg3odSi2pQvyNYfBep" },
  { line: "S", id: "nonfiction", name: "受賞ノンフィクション", en: "Award-winning nonfiction · six genres", blurb: "6つのジャンルの受賞作", kind: "claude", url: "https://claude.ai/artifact/UJWu7YwxkaNW4BhtpyCvdh" },
  { line: "S", id: "primers", name: "学問の入門書", en: "Discipline primers · reading list", blurb: "いろいろな分野を日本語の入門書で", kind: "claude", url: "https://claude.ai/artifact/PrreYkpjsF4E1toYWhrkdD" },
  { line: "S", id: "nihon365", name: "日本365 分野地図", en: "Japan 365 · domain map", blurb: "一日一つ日本を知るための、20分野の地図", kind: "claude", url: "https://claude.ai/artifact/AiiGzYjE41QHRznm8XhjyR" },
];
