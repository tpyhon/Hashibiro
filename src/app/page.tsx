"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "plan" | "favorite" | "history";
type Status = "suggested" | "favorite" | "visited";
type AppView = "loading" | "onboarding" | "main";
type OnboardingStep = "welcome" | "create" | "create_success" | "join";

interface Place {
  id: number;
  name: string;
  type: "restaurant" | "date_spot";
  category: string;
  status: Status;
  budget: string;
  business_hours: string;
  payment_methods: string;
  tabelog_url: string;
  comment: string;
  created_at: string;
  room_id: string;
}

interface RoomUser {
  id: string;
  nickname: string;
  home_station: string;
  device_id: string;
}

interface WeatherInfo {
  available: boolean;
  weatherLabel: string;
  tempLabel: string;
  rain: number;
}

interface MidpointArea {
  name: string;
  description: string;
  access: string;
}

const WMO_CODES: Record<number, string> = {
  0: "快晴", 1: "晴れ", 2: "一部曇り", 3: "曇り",
  45: "霧", 48: "着氷性の霧",
  51: "小雨（霧雨）", 53: "霧雨", 55: "強い霧雨",
  61: "小雨", 63: "雨", 65: "大雨",
  71: "小雪", 73: "雪", 75: "大雪", 77: "あられ",
  80: "にわか雨（弱）", 81: "にわか雨", 82: "にわか雨（強）",
  85: "にわか雪（弱）", 86: "にわか雪（強）",
  95: "雷雨", 96: "雷雨（ひょう）", 99: "激しい雷雨（ひょう）",
};

const BUDGET_OPTIONS = [2000, 3000, 5000, 8000, 10000];

const MOODS = [
  "🍝 がっつり食べたい",
  "☕ まったりしたい",
  "🌿 外を歩きたい",
  "🎨 文化的な体験",
  "🍣 和食気分",
];

const TIME_PERIODS = [
  { key: "lunch", label: "🌞 ランチ", desc: "11:00〜14:00" },
  { key: "afternoon", label: "🌆 午後", desc: "14:00〜18:00" },
  { key: "dinner", label: "🌙 ディナー", desc: "18:00〜22:00" },
] as const;
type TimePeriod = (typeof TIME_PERIODS)[number]["key"];

const categoryColors: Record<string, string> = {
  イタリアン: "bg-orange-100 text-orange-700",
  "カフェ・本屋": "bg-amber-100 text-amber-700",
  公園: "bg-green-100 text-green-700",
  フレンチ: "bg-blue-100 text-blue-700",
  "ショッピング・散歩": "bg-purple-100 text-purple-700",
  和食: "bg-red-100 text-red-700",
  中華: "bg-yellow-100 text-yellow-700",
  美術館: "bg-indigo-100 text-indigo-700",
  バー: "bg-pink-100 text-pink-700",
  ビストロ: "bg-teal-100 text-teal-700",
};

function categoryColor(cat: string) {
  return categoryColors[cat] ?? "bg-gray-100 text-gray-600";
}

function todayString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("hb_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("hb_device_id", id);
  }
  return id;
}

function weatherEmoji(info: WeatherInfo): string {
  if (!info.available) return "🌤️";
  const w = info.weatherLabel;
  if (w.includes("雷")) return "⛈️";
  if (w.includes("雪")) return "❄️";
  if (w.includes("雨") || w.includes("霧雨") || w.includes("あられ")) return "🌧️";
  if (w.includes("霧")) return "🌫️";
  if (w.includes("曇り") && !w.includes("一部")) return "☁️";
  if (w.includes("一部曇り")) return "🌤️";
  return "☀️";
}

async function fetchWeatherForDisplay(date: string): Promise<WeatherInfo | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const daily = json.daily;
    const code = daily?.weather_code?.[0];
    const tMax = daily?.temperature_2m_max?.[0];
    const tMin = daily?.temperature_2m_min?.[0];
    const rain = daily?.precipitation_sum?.[0];
    if (code == null || tMax == null || tMin == null) {
      return { available: false, weatherLabel: "", tempLabel: "", rain: 0 };
    }
    return {
      available: true,
      weatherLabel: WMO_CODES[code as number] ?? "天気不明",
      tempLabel: `最高${Math.round(tMax)}℃ / 最低${Math.round(tMin)}℃`,
      rain: Math.round((rain ?? 0) * 10) / 10,
    };
  } catch {
    return null;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 inset-x-4 z-50 flex justify-center pointer-events-none">
      <div className="bg-rose-500 text-white text-sm px-5 py-3 rounded-2xl shadow-xl max-w-sm text-center leading-6 whitespace-pre-line">
        {message}
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({
  roomCode,
  roomUsers,
  deviceId,
  onClose,
  onSaved,
  onLeaveRoom,
}: {
  roomCode: string;
  roomUsers: RoomUser[];
  deviceId: string;
  onClose: () => void;
  onSaved: () => void;
  onLeaveRoom: () => void;
}) {
  const myUser = roomUsers.find((u) => u.device_id === deviceId);
  const partnerUser = roomUsers.find((u) => u.device_id !== deviceId);
  const [myNickname, setMyNickname] = useState(myUser?.nickname ?? "");
  const [myStation, setMyStation] = useState(myUser?.home_station ?? "");
  const [partnerNickname, setPartnerNickname] = useState(partnerUser?.nickname ?? "");
  const [partnerStation, setPartnerStation] = useState(partnerUser?.home_station ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updates = [];
    if (myUser) updates.push(supabase.from("users").update({ nickname: myNickname, home_station: myStation }).eq("id", myUser.id).then());
    if (partnerUser) updates.push(supabase.from("users").update({ nickname: partnerNickname, home_station: partnerStation }).eq("id", partnerUser.id).then());
    await Promise.all(updates);
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-gray-800">⚙️ ルーム設定</h2>

        <div className="bg-rose-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">招待コード（パートナーに送ってね）</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-rose-500 tracking-widest">{roomCode}</span>
            <button onClick={handleCopyCode} className="text-xs px-2.5 py-1 rounded-full bg-rose-500 text-white hover:bg-rose-600">
              {copied ? "✓ コピー済" : "コピー"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500">👤 あなた</p>
          <input type="text" value={myNickname} onChange={(e) => setMyNickname(e.target.value)} placeholder="ニックネーム"
            className="border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          <input type="text" value={myStation} onChange={(e) => setMyStation(e.target.value)} placeholder="最寄り駅（例：目黒駅）"
            className="border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500">💑 パートナー {!partnerUser && <span className="text-rose-300">（未参加）</span>}</p>
          {partnerUser ? (
            <>
              <input type="text" value={partnerNickname} onChange={(e) => setPartnerNickname(e.target.value)} placeholder="ニックネーム"
                className="border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
              <input type="text" value={partnerStation} onChange={(e) => setPartnerStation(e.target.value)} placeholder="最寄り駅（例：渋谷駅）"
                className="border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
            </>
          ) : (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">パートナーがコードで参加すると表示されます</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">キャンセル</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50">
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>

        <button onClick={onLeaveRoom} className="text-xs text-gray-400 hover:text-gray-600 text-center py-1">
          別のルームに切り替える →
        </button>
      </div>
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardingScreen({ deviceId, onEntered }: { deviceId: string; onEntered: (roomId: string, roomCode: string) => void }) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [nickname, setNickname] = useState("");
  const [homeStation, setHomeStation] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const callRoomsApi = async (body: Record<string, string>) => {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, deviceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "エラーが発生しました");
    return data;
  };

  const handleCreate = async () => {
    if (!nickname.trim() || !homeStation.trim()) { setError("ニックネームと最寄り駅を入力してください"); return; }
    setLoading(true); setError(null);
    try {
      const data = await callRoomsApi({ action: "create", nickname: nickname.trim(), homeStation: homeStation.trim() });
      setCreatedCode(data.room.code);
      setCreatedRoomId(data.room.id);
      setStep("create_success");
    } catch (e) { setError(e instanceof Error ? e.message : "エラーが発生しました"); }
    finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim() || !nickname.trim() || !homeStation.trim()) { setError("すべての項目を入力してください"); return; }
    setLoading(true); setError(null);
    try {
      const data = await callRoomsApi({ action: "join", code: inviteCode.trim(), nickname: nickname.trim(), homeStation: homeStation.trim() });
      onEntered(data.room.id, data.room.code);
    } catch (e) { setError(e instanceof Error ? e.message : "エラーが発生しました"); }
    finally { setLoading(false); }
  };

  const inputCls = "w-full border border-rose-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: "#fff8f8" }}>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <p className="text-5xl mb-3">🦤</p>
          <h1 className="text-2xl font-extrabold text-rose-500">Hashibiro</h1>
          <p className="text-sm text-gray-500 mt-1">二人だけのデートプランアプリ</p>
        </div>

        {step === "welcome" && (
          <div className="flex flex-col gap-3">
            <button onClick={() => { setStep("create"); setError(null); }}
              className="w-full py-4 rounded-2xl bg-rose-500 text-white font-bold text-base shadow-sm hover:bg-rose-600 transition-colors">
              ＋ 新しいルームを作る
            </button>
            <button onClick={() => { setStep("join"); setError(null); }}
              className="w-full py-4 rounded-2xl bg-white border-2 border-rose-200 text-rose-500 font-bold text-base hover:bg-rose-50 transition-colors">
              🔑 招待コードで参加する
            </button>
          </div>
        )}

        {step === "create" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <h2 className="font-bold text-gray-800">ルームを作る</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ニックネーム</label>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例：たくみ" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">最寄り駅</label>
                <input type="text" value={homeStation} onChange={(e) => setHomeStation(e.target.value)} placeholder="例：目黒駅" className={inputCls} />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">⚠️ {error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep("welcome")} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500">戻る</button>
              <button onClick={handleCreate} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50">
                {loading ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        )}

        {step === "create_success" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm flex flex-col gap-4 text-center">
            <p className="text-3xl">🎉</p>
            <h2 className="font-bold text-gray-800">ルーム作成完了！</h2>
            <p className="text-sm text-gray-500">このコードをパートナーに送ってね</p>
            <div className="bg-rose-50 rounded-xl py-5 px-6">
              <p className="text-3xl font-black text-rose-500 tracking-[0.3em]">{createdCode}</p>
            </div>
            <button onClick={async () => { await navigator.clipboard.writeText(createdCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="py-2.5 rounded-xl border-2 border-rose-200 text-rose-500 text-sm font-medium hover:bg-rose-50">
              {copied ? "✓ コピーしました" : "コードをコピー"}
            </button>
            <button onClick={() => onEntered(createdRoomId, createdCode)}
              className="py-2.5 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600">
              アプリを始める →
            </button>
          </div>
        )}

        {step === "join" && (
          <div className="bg-white rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <h2 className="font-bold text-gray-800">コードで参加する</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">招待コード（6文字）</label>
                <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="例：KR5X2A" maxLength={6}
                  className={`${inputCls} font-mono tracking-widest uppercase`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ニックネーム</label>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例：あいか" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">最寄り駅</label>
                <input type="text" value={homeStation} onChange={(e) => setHomeStation(e.target.value)} placeholder="例：渋谷駅" className={inputCls} />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">⚠️ {error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep("welcome")} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500">戻る</button>
              <button onClick={handleJoin} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50">
                {loading ? "参加中..." : "参加する"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Place Card ───────────────────────────────────────────────────────────────
function PlaceCard({ place, onFavorite, onVisited, onVisit }: {
  place: Place; onFavorite: (id: number) => void; onVisited: (id: number) => void; onVisit: (url: string) => void;
}) {
  const isFav = place.status === "favorite";
  const isVisited = place.status === "visited";
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-50 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-base leading-tight">{place.name}</h3>
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(place.category)}`}>{place.category}</span>
        </div>
        <button onClick={() => onFavorite(place.id)}
          className={`text-xl flex-shrink-0 transition-transform hover:scale-110 ${isFav ? "text-rose-500" : "text-gray-300"}`}>
          {isFav ? "❤️" : "🖤"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
        <div><span className="font-medium text-gray-700">💰 予算</span><p>{place.budget}</p></div>
        <div><span className="font-medium text-gray-700">🕐 営業時間</span><p>{place.business_hours}</p></div>
        <div className="col-span-2"><span className="font-medium text-gray-700">💳 支払い</span><p>{place.payment_methods}</p></div>
        {place.comment && (
          <div className="col-span-2 bg-rose-50 rounded-xl px-3 py-1.5">
            <p className="text-rose-700 text-xs">💬 {place.comment}</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onVisit(place.tabelog_url)}
          className="flex-1 text-center text-xs font-medium bg-rose-500 text-white rounded-full py-2 hover:bg-rose-600 transition-colors">
          ここにする！ 🗺️
        </button>
        <button onClick={() => onVisited(place.id)} disabled={isVisited}
          className={`flex-1 text-xs font-medium rounded-full py-2 border transition-colors ${isVisited ? "bg-gray-100 text-gray-400 border-gray-200 cursor-default" : "bg-white text-rose-500 border-rose-300 hover:bg-rose-50"}`}>
          {isVisited ? "行ったよ！✅" : "行ったよ！ 👣"}
        </button>
      </div>
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
const SEARCH_STEPS = [
  { icon: "🗺️", text: "中間エリアを特定中..." },
  { icon: "🍽️", text: "レストランをリサーチ中..." },
  { icon: "🔍", text: "食べログURLを確認中..." },
  { icon: "✨", text: "デートプランを整理中..." },
];

function StatusBar({ isLoading }: { isLoading: boolean }) {
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (!isLoading) return;
    setProgress(0); setStepIdx(0);
    const pt = setInterval(() => setProgress((p) => p + Math.max((90 - p) * 0.07, 0.5)), 500);
    const st = setInterval(() => setStepIdx((i) => Math.min(i + 1, SEARCH_STEPS.length - 1)), 4500);
    return () => { clearInterval(pt); clearInterval(st); };
  }, [isLoading]);
  if (!isLoading) return null;
  const step = SEARCH_STEPS[stepIdx];
  return (
    <div className="sticky top-[57px] z-10 bg-white border-b border-rose-100 shadow-sm">
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span className="flex items-center gap-1"><span>{step.icon}</span><span>{step.text}</span></span>
          <span className="text-rose-400 font-medium tabular-nums">{Math.min(Math.round(progress), 90)}%</span>
        </div>
        <div className="h-1.5 bg-rose-50 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min(progress, 90)}%` }} />
        </div>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-50 p-6 flex flex-col items-center gap-3">
      <div className="text-4xl animate-bounce">🦤</div>
      <p className="text-sm font-semibold text-rose-500">ハシビロコウが中間地点を探索中...</p>
      <p className="text-xs text-gray-400">Geminiが最高のデートスポットを選んでいます</p>
      <div className="w-full flex flex-col gap-2 mt-2 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-rose-50 rounded-full" />)}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [appView, setAppView] = useState<AppView>("loading");
  const [deviceId, setDeviceId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>("dinner");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentArea, setCurrentArea] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(10000);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null | "loading">("loading");
  const [midpoints, setMidpoints] = useState<MidpointArea[]>([]);
  const [isMidpointLoading, setIsMidpointLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const lastFetchKey = useRef("");

  // 起動時: deviceId + ルーム確認
  useEffect(() => {
    const did = getOrCreateDeviceId();
    setDeviceId(did);
    const rid = localStorage.getItem("hb_room_id");
    const rc = localStorage.getItem("hb_room_code");
    if (rid && rc) { setRoomId(rid); setRoomCode(rc); setAppView("main"); }
    else setAppView("onboarding");
  }, []);

  const handleRoomEntered = (newRoomId: string, newRoomCode: string) => {
    localStorage.setItem("hb_room_id", newRoomId);
    localStorage.setItem("hb_room_code", newRoomCode);
    setRoomId(newRoomId); setRoomCode(newRoomCode);
    setIsInitialLoading(true);
    setAppView("main");
  };

  const handleLeaveRoom = () => {
    localStorage.removeItem("hb_room_id"); localStorage.removeItem("hb_room_code");
    setRoomId(""); setRoomCode(""); setRoomUsers([]); setPlaces([]);
    setCurrentArea(null); setSelectedMood(null); setMidpoints([]); setSelectedArea(null);
    lastFetchKey.current = "";
    setShowSettings(false);
    setAppView("onboarding");
  };

  const myUser = roomUsers.find((u) => u.device_id === deviceId);
  const partnerUser = roomUsers.find((u) => u.device_id !== deviceId);
  const stationA = myUser?.home_station ?? "";
  const stationB = partnerUser?.home_station ?? "";

  const loadPlaces = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.from("places").select("*").eq("room_id", roomId).order("created_at", { ascending: false });
    setPlaces((data as Place[]) ?? []);
  }, [roomId]);

  const loadUsers = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.from("users").select("id, nickname, home_station, device_id").eq("room_id", roomId);
    if (data) setRoomUsers(data as RoomUser[]);
  }, [roomId]);

  const fetchMidpoints = useCallback(async () => {
    if (!stationA || !stationB) return;
    setIsMidpointLoading(true);
    try {
      const res = await fetch("/api/midpoints", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationA, stationB, roomId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newAreas: MidpointArea[] = data.areas ?? [];
      setMidpoints(newAreas);
      setSelectedArea((prev) => (prev && newAreas.some((a) => a.name === prev) ? prev : null));
    } catch { } finally { setIsMidpointLoading(false); }
  }, [stationA, stationB, roomId]);

  // ルーム確定後の初期ロード
  useEffect(() => {
    if (appView !== "main" || !roomId) return;
    Promise.all([loadUsers(), loadPlaces()]).finally(() => setIsInitialLoading(false));
  }, [appView, roomId, loadUsers, loadPlaces]);

  // リアルタイム同期
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`rt-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "places", filter: `room_id=eq.${roomId}` }, loadPlaces)
      .on("postgres_changes", { event: "*", schema: "public", table: "users", filter: `room_id=eq.${roomId}` }, loadUsers)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, loadPlaces, loadUsers]);

  // 日付変更で天気取得
  useEffect(() => {
    let cancelled = false;
    setWeatherInfo("loading");
    fetchWeatherForDisplay(selectedDate).then((info) => { if (!cancelled) setWeatherInfo(info); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  // 時間帯変更でデフォルト予算更新
  useEffect(() => { setSelectedBudget(selectedTimePeriod === "dinner" ? 10000 : 5000); }, [selectedTimePeriod]);

  // 初期ロード完了 or 駅変更後にエリア候補取得
  useEffect(() => {
    if (!isInitialLoading && appView === "main") fetchMidpoints();
  }, [fetchMidpoints, isInitialLoading, appView]);

  const handleFavorite = async (id: number) => {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    const newStatus: Status = place.status === "favorite" ? "suggested" : "favorite";
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    await supabase.from("places").update({ status: newStatus }).eq("id", id);
  };

  const handleVisited = async (id: number) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, status: "visited" } : p)));
    await supabase.from("places").update({ status: "visited" }).eq("id", id);
  };

  const handleVisit = (url: string) => {
    setToast("予約ページを開くよ！🗺️\nデート楽しんでね 💕\nポップアップブロックに注意してね！");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleMoodSelect = async (mood: string) => {
    const newMood = mood === selectedMood ? null : mood;
    setSelectedMood(newMood);
    setErrorMsg(null);
    if (!newMood) return;

    const fetchKey = `${newMood}:${selectedDate}:${selectedTimePeriod}:${selectedBudget}:${selectedArea}`;
    if (fetchKey === lastFetchKey.current) { setActiveTab("plan"); return; }

    setIsLoading(true); setCurrentArea(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: newMood, date: selectedDate, timePeriod: selectedTimePeriod, budget: selectedBudget, area: selectedArea, roomId }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "APIエラー"); }
      const data = await res.json();
      setCurrentArea(data.area);
      lastFetchKey.current = fetchKey;
      await loadPlaces();
      setActiveTab("plan");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally { setIsLoading(false); }
  };

  if (appView === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fff8f8" }}>
        <div className="text-center"><p className="text-5xl animate-bounce">🦤</p><p className="text-sm mt-3 text-gray-400">起動中...</p></div>
      </div>
    );
  }

  if (appView === "onboarding") {
    return <OnboardingScreen deviceId={deviceId} onEntered={handleRoomEntered} />;
  }

  const planPlaces = places.filter((p) => p.status === "suggested" || p.status === "favorite");
  const favoritePlaces = places.filter((p) => p.status === "favorite");
  const visitedPlaces = places.filter((p) => p.status === "visited");
  const displayedPlaces = activeTab === "plan" ? planPlaces : activeTab === "favorite" ? favoritePlaces : visitedPlaces;

  const tabs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "plan", label: "作戦会議", icon: "🗓️", count: planPlaces.length },
    { key: "favorite", label: "お気に入り", icon: "❤️", count: favoritePlaces.length },
    { key: "history", label: "あしあと", icon: "👣", count: visitedPlaces.length },
  ];

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: "#fff8f8" }}>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {showSettings && (
        <SettingsModal roomCode={roomCode} roomUsers={roomUsers} deviceId={deviceId}
          onClose={() => setShowSettings(false)} onSaved={loadUsers} onLeaveRoom={handleLeaveRoom} />
      )}

      <header className="bg-white border-b border-rose-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-rose-500 tracking-tight">Hashibiro 🦤</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="text-xs text-gray-500 text-right leading-5 hover:text-rose-400 transition-colors">
              <p>🚉 {myUser?.nickname ?? "?"}({stationA || "?"}) ↔ {partnerUser?.nickname ?? "未参加"}({stationB || "?"})</p>
              {currentArea ? <p className="text-rose-400 font-medium">📍 {currentArea}</p> : <p className="text-rose-300">タップで設定 · {roomCode}</p>}
            </button>
            <button onClick={() => setShowSettings(true)} className="text-lg text-gray-400 hover:text-rose-400 transition-colors">⚙️</button>
          </div>
        </div>
      </header>

      <StatusBar isLoading={isLoading} />

      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
        {/* 天気カード */}
        {weatherInfo === "loading" ? (
          <div className="h-16 bg-sky-50 rounded-2xl animate-pulse border border-sky-100 mb-4" />
        ) : weatherInfo ? (
          <div className={`rounded-2xl border p-3 mb-4 flex items-center gap-3 ${weatherInfo.available ? "bg-gradient-to-r from-sky-50 to-blue-50 border-sky-100" : "bg-amber-50 border-amber-100"}`}>
            <span className="text-3xl">{weatherEmoji(weatherInfo)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-400">{selectedDate} の東京の天気</p>
              {weatherInfo.available ? (
                <><p className="text-sm font-bold text-gray-800">{weatherInfo.weatherLabel}</p><p className="text-xs text-gray-500">{weatherInfo.tempLabel} · 降水量 {weatherInfo.rain}mm</p></>
              ) : (
                <p className="text-sm font-medium text-amber-700">予報期間外 — 晴れ想定で提案します ☀️</p>
              )}
            </div>
          </div>
        ) : null}

        {/* タブ */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-rose-50 mb-5">
          {tabs.map(({ key, label, icon, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-all ${activeTab === key ? "bg-rose-500 text-white shadow-sm" : "text-gray-500 hover:text-rose-400"}`}>
              <span>{icon}</span><span>{label}</span>
              {count > 0 && <span className={`text-[10px] mt-0.5 px-1.5 rounded-full ${activeTab === key ? "bg-white/30 text-white" : "bg-rose-100 text-rose-500"}`}>{count}件</span>}
            </button>
          ))}
        </div>

        {/* 作戦会議タブ */}
        {activeTab === "plan" && (
          <div className="mb-5 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">📅 いつ行く？</p>
              <input type="date" value={selectedDate} min={todayString()} onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-rose-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-300" />
              <div className="flex gap-2">
                {TIME_PERIODS.map(({ key, label, desc }) => (
                  <button key={key} onClick={() => setSelectedTimePeriod(key)}
                    className={`flex-1 flex flex-col items-center py-2 rounded-xl border text-xs transition-all ${selectedTimePeriod === key ? "bg-rose-500 text-white border-rose-500" : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"}`}>
                    <span>{label}</span>
                    <span className={`text-[10px] mt-0.5 ${selectedTimePeriod === key ? "text-white/70" : "text-gray-400"}`}>{desc}</span>
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">💰 予算（お一人様）</p>
                <div className="flex gap-1.5 flex-wrap">
                  {BUDGET_OPTIONS.map((v) => (
                    <button key={v} onClick={() => setSelectedBudget(v)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${selectedBudget === v ? "bg-rose-500 text-white border-rose-500" : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"}`}>
                      ¥{v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">📍 どのエリアに行く？</p>
                <button onClick={fetchMidpoints} disabled={isMidpointLoading}
                  className="text-xs text-rose-400 hover:text-rose-600 disabled:opacity-40 transition-colors">
                  {isMidpointLoading ? "探し中..." : "↺ 再取得"}
                </button>
              </div>
              {isMidpointLoading ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[1, 2, 3].map((i) => <div key={i} className="flex-shrink-0 w-[140px] h-[80px] bg-rose-50 rounded-xl animate-pulse" />)}
                </div>
              ) : midpoints.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                  {midpoints.map((area) => (
                    <button key={area.name} onClick={() => setSelectedArea(area.name === selectedArea ? null : area.name)}
                      className={`flex-shrink-0 flex flex-col text-left px-3 py-2.5 rounded-xl border transition-all min-w-[140px] max-w-[170px] ${selectedArea === area.name ? "bg-rose-500 text-white border-rose-500 shadow-sm" : "bg-rose-50/50 text-gray-700 border-rose-100 hover:border-rose-300"}`}>
                      <span className="font-bold text-sm leading-tight">{area.name}</span>
                      <span className={`text-[10px] mt-1 line-clamp-2 leading-snug ${selectedArea === area.name ? "text-white/80" : "text-gray-500"}`}>{area.description}</span>
                      <span className={`text-[10px] mt-1.5 ${selectedArea === area.name ? "text-white/60" : "text-rose-400"}`}>🚉 {area.access}</span>
                    </button>
                  ))}
                </div>
              ) : !isMidpointLoading && stationA && stationB ? (
                <p className="text-xs text-gray-400">エリアを取得できませんでした</p>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">気分は？</p>
              {!selectedArea && midpoints.length > 0 && <p className="text-xs text-rose-300 mb-2">↑ まずエリアを選んでね！</p>}
              <div className="flex flex-wrap gap-2">
                {MOODS.map((mood) => (
                  <button key={mood} onClick={() => handleMoodSelect(mood)} disabled={isLoading || !selectedArea}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-40 ${selectedMood === mood ? "bg-rose-500 text-white border-rose-500" : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"}`}>
                    {mood}
                  </button>
                ))}
              </div>
              {errorMsg && <p className="text-xs text-red-500 mt-2">⚠️ {errorMsg}</p>}
            </div>
          </div>
        )}

        {activeTab === "history" && visitedPlaces.length > 0 && (
          <div className="mb-4 bg-white rounded-2xl p-4 border border-rose-50 shadow-sm text-center">
            <p className="text-2xl">👣</p>
            <p className="text-sm font-semibold text-gray-700 mt-1">二人の思い出スポット</p>
            <p className="text-xs text-gray-400">{visitedPlaces.length}箇所を一緒に訪れました</p>
          </div>
        )}

        {isInitialLoading && <div className="text-center py-16"><p className="text-3xl animate-bounce">🦤</p><p className="text-sm mt-2 text-gray-400">データを読み込み中...</p></div>}
        {!isInitialLoading && isLoading && activeTab === "plan" && <LoadingCard />}
        {!isInitialLoading && !isLoading && displayedPlaces.length > 0 && (
          <div className="flex flex-col gap-3">
            {displayedPlaces.map((place) => (
              <PlaceCard key={place.id} place={place} onFavorite={handleFavorite} onVisited={handleVisited} onVisit={handleVisit} />
            ))}
          </div>
        )}
        {!isInitialLoading && !isLoading && displayedPlaces.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            {activeTab === "plan" ? (
              <><p className="text-4xl mb-3">🦤</p><p className="text-sm font-medium text-gray-500">エリアと気分を選んで</p><p className="text-sm text-gray-400">ハシビロコウにデートプランを聞いてみよう！</p></>
            ) : (
              <><p className="text-4xl mb-3">🌸</p><p className="text-sm">まだここには何もありません</p></>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
