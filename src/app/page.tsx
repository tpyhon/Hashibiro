"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "plan" | "favorite" | "history";
type Status = "suggested" | "favorite" | "visited";

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
}

interface UserStation {
  me: string;
  partner: string;
}

interface WeatherInfo {
  available: boolean;
  weatherLabel: string;
  tempLabel: string;
  rain: number;
}

const WMO_CODES: Record<number, string> = {
  0: "快晴", 1: "晴れ", 2: "一部曇り", 3: "曇り",
  45: "霧", 48: "着氷性の霧",
  51: "小雨（霧雨）", 53: "霧雨", 55: "強い霧雨",
  61: "小雨", 63: "雨", 65: "大雨",
  71: "小雪", 73: "雪", 75: "大雪",
  77: "あられ",
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

function todayString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
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

// ─── Toast ───────────────────────────────────────────────────────────────────

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

// ─── Station Settings Modal ───────────────────────────────────────────────────

function SettingsModal({
  stations,
  onClose,
  onSaved,
}: {
  stations: UserStation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [meStation, setMeStation] = useState(stations.me);
  const [partnerStation, setPartnerStation] = useState(stations.partner);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from("users").update({ home_station: meStation }).eq("role", "me"),
      supabase.from("users").update({ home_station: partnerStation }).eq("role", "partner"),
    ]);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-800 mb-4">🚉 最寄り駅を変更</h2>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              あなたの最寄り駅
            </label>
            <input
              type="text"
              value={meStation}
              onChange={(e) => setMeStation(e.target.value)}
              placeholder="例：目黒駅"
              className="w-full border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              彼女の最寄り駅
            </label>
            <input
              type="text"
              value={partnerStation}
              onChange={(e) => setPartnerStation(e.target.value)}
              placeholder="例：東京駅"
              className="w-full border border-rose-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Place Card ───────────────────────────────────────────────────────────────

function PlaceCard({
  place,
  onFavorite,
  onVisited,
  onVisit,
}: {
  place: Place;
  onFavorite: (id: number) => void;
  onVisited: (id: number) => void;
  onVisit: (url: string) => void;
}) {
  const isFav = place.status === "favorite";
  const isVisited = place.status === "visited";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-50 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-base leading-tight">{place.name}</h3>
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(place.category)}`}>
            {place.category}
          </span>
        </div>
        <button
          onClick={() => onFavorite(place.id)}
          className={`text-xl flex-shrink-0 transition-transform hover:scale-110 ${isFav ? "text-rose-500" : "text-gray-300"}`}
        >
          {isFav ? "❤️" : "🖤"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
        <div>
          <span className="font-medium text-gray-700">💰 予算</span>
          <p>{place.budget}</p>
        </div>
        <div>
          <span className="font-medium text-gray-700">🕐 営業時間</span>
          <p>{place.business_hours}</p>
        </div>
        <div className="col-span-2">
          <span className="font-medium text-gray-700">💳 支払い</span>
          <p>{place.payment_methods}</p>
        </div>
        {place.comment && (
          <div className="col-span-2 bg-rose-50 rounded-xl px-3 py-1.5">
            <p className="text-rose-700 text-xs">💬 {place.comment}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onVisit(place.tabelog_url)}
          className="flex-1 text-center text-xs font-medium bg-rose-500 text-white rounded-full py-2 hover:bg-rose-600 transition-colors"
        >
          ここにする！ 🗺️
        </button>
        <button
          onClick={() => onVisited(place.id)}
          disabled={isVisited}
          className={`flex-1 text-xs font-medium rounded-full py-2 border transition-colors ${
            isVisited
              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-default"
              : "bg-white text-rose-500 border-rose-300 hover:bg-rose-50"
          }`}
        >
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
    setProgress(0);
    setStepIdx(0);

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        const remaining = 90 - prev;
        return prev + Math.max(remaining * 0.07, 0.5);
      });
    }, 500);

    const stepTimer = setInterval(() => {
      setStepIdx((prev) => Math.min(prev + 1, SEARCH_STEPS.length - 1));
    }, 4500);

    return () => {
      clearInterval(progressTimer);
      clearInterval(stepTimer);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  const step = SEARCH_STEPS[stepIdx];

  return (
    <div className="sticky top-[57px] z-10 bg-white border-b border-rose-100 shadow-sm">
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span className="flex items-center gap-1">
            <span>{step.icon}</span>
            <span>{step.text}</span>
          </span>
          <span className="text-rose-400 font-medium tabular-nums">
            {Math.min(Math.round(progress), 90)}%
          </span>
        </div>
        <div className="h-1.5 bg-rose-50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 90)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Loading Card ─────────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-50 p-6 flex flex-col items-center gap-3">
      <div className="text-4xl animate-bounce">🦤</div>
      <p className="text-sm font-semibold text-rose-500">ハシビロコウが中間地点を探索中...</p>
      <p className="text-xs text-gray-400">Geminiが最高のデートスポットを選んでいます</p>
      <div className="w-full flex flex-col gap-2 mt-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 bg-rose-50 rounded-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [places, setPlaces] = useState<Place[]>([]);
  const [stations, setStations] = useState<UserStation>({ me: "目黒駅", partner: "東京駅" });
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>("dinner");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentArea, setCurrentArea] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<number>(10000);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null | "loading">("loading");

  const loadPlaces = useCallback(async () => {
    const { data } = await supabase
      .from("places")
      .select("*")
      .order("created_at", { ascending: false });
    setPlaces((data as Place[]) ?? []);
  }, []);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("users").select("role, home_station");
    if (data) {
      const me = data.find((u) => u.role === "me");
      const partner = data.find((u) => u.role === "partner");
      setStations({
        me: me?.home_station ?? "目黒駅",
        partner: partner?.home_station ?? "東京駅",
      });
    }
  }, []);

  // 初期ロード
  useEffect(() => {
    Promise.all([loadUsers(), loadPlaces()]).finally(() =>
      setIsInitialLoading(false)
    );
  }, [loadUsers, loadPlaces]);

  // リアルタイム同期
  useEffect(() => {
    const channel = supabase
      .channel("realtime-hashibiro")
      .on("postgres_changes", { event: "*", schema: "public", table: "places" }, () => {
        loadPlaces();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        loadUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPlaces, loadUsers]);

  // 日付変更で天気を取得
  useEffect(() => {
    let cancelled = false;
    setWeatherInfo("loading");
    fetchWeatherForDisplay(selectedDate).then((info) => {
      if (!cancelled) setWeatherInfo(info);
    });
    return () => { cancelled = true; };
  }, [selectedDate]);

  // 時間帯変更でデフォルト予算を更新
  useEffect(() => {
    setSelectedBudget(selectedTimePeriod === "dinner" ? 10000 : 5000);
  }, [selectedTimePeriod]);

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

    setIsLoading(true);
    setCurrentArea(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: newMood, date: selectedDate, timePeriod: selectedTimePeriod, budget: selectedBudget }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "APIエラーが発生しました");
      }
      const data = await res.json();
      setCurrentArea(data.area);
      await loadPlaces();
      setActiveTab("plan");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const planPlaces = places.filter((p) => p.status === "suggested" || p.status === "favorite");
  const favoritePlaces = places.filter((p) => p.status === "favorite");
  const visitedPlaces = places.filter((p) => p.status === "visited");

  const tabs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "plan", label: "作戦会議", icon: "🗓️", count: planPlaces.length },
    { key: "favorite", label: "お気に入り", icon: "❤️", count: favoritePlaces.length },
    { key: "history", label: "あしあと", icon: "👣", count: visitedPlaces.length },
  ];

  const displayedPlaces =
    activeTab === "plan" ? planPlaces
    : activeTab === "favorite" ? favoritePlaces
    : visitedPlaces;

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: "#fff8f8" }}>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {showSettings && (
        <SettingsModal
          stations={stations}
          onClose={() => setShowSettings(false)}
          onSaved={loadUsers}
        />
      )}

      {/* ヘッダー */}
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-rose-500 tracking-tight">
              Hashibiro 🦤
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="text-xs text-gray-500 text-right leading-5 hover:text-rose-400 transition-colors"
              >
                <p>🚉 {stations.me} ↔ {stations.partner}</p>
                {currentArea ? (
                  <p className="text-rose-400 font-medium">📍 {currentArea}</p>
                ) : (
                  <p className="text-rose-300">タップで駅を変更</p>
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="text-lg text-gray-400 hover:text-rose-400 transition-colors"
                title="駅を変更"
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>
      </header>

      <StatusBar isLoading={isLoading} />

      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
        {/* 天気カード */}
        {weatherInfo === "loading" ? (
          <div className="h-16 bg-sky-50 rounded-2xl animate-pulse border border-sky-100 mb-4" />
        ) : weatherInfo ? (
          <div className={`rounded-2xl border p-3 mb-4 flex items-center gap-3 ${
            weatherInfo.available
              ? "bg-gradient-to-r from-sky-50 to-blue-50 border-sky-100"
              : "bg-amber-50 border-amber-100"
          }`}>
            <span className="text-3xl">{weatherEmoji(weatherInfo)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-400">{selectedDate} の東京の天気</p>
              {weatherInfo.available ? (
                <>
                  <p className="text-sm font-bold text-gray-800">{weatherInfo.weatherLabel}</p>
                  <p className="text-xs text-gray-500">{weatherInfo.tempLabel} · 降水量 {weatherInfo.rain}mm</p>
                </>
              ) : (
                <p className="text-sm font-medium text-amber-700">予報期間外 — 晴れ想定で提案します ☀️</p>
              )}
            </div>
          </div>
        ) : null}

        {/* タブ */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-rose-50 mb-5">
          {tabs.map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === key
                  ? "bg-rose-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-rose-400"
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
              {count > 0 && (
                <span className={`text-[10px] mt-0.5 px-1.5 rounded-full ${
                  activeTab === key ? "bg-white/30 text-white" : "bg-rose-100 text-rose-500"
                }`}>
                  {count}件
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 作戦会議: 日時 + 気分 */}
        {activeTab === "plan" && (
          <div className="mb-5 flex flex-col gap-4">

            {/* 日付・時間帯 */}
            <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">📅 いつ行く？</p>
              <input
                type="date"
                value={selectedDate}
                min={todayString()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-rose-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <div className="flex gap-2">
                {TIME_PERIODS.map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedTimePeriod(key)}
                    className={`flex-1 flex flex-col items-center py-2 rounded-xl border text-xs transition-all ${
                      selectedTimePeriod === key
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] mt-0.5 ${selectedTimePeriod === key ? "text-white/70" : "text-gray-400"}`}>{desc}</span>
                  </button>
                ))}
              </div>

              {/* 予算 */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">💰 予算（お一人様）</p>
                <div className="flex gap-1.5 flex-wrap">
                  {BUDGET_OPTIONS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setSelectedBudget(v)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                        selectedBudget === v
                          ? "bg-rose-500 text-white border-rose-500"
                          : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"
                      }`}
                    >
                      ¥{v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 気分ボタン */}
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">気分は？</p>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((mood) => (
                  <button
                    key={mood}
                    onClick={() => handleMoodSelect(mood)}
                    disabled={isLoading}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${
                      selectedMood === mood
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
              {errorMsg && <p className="text-xs text-red-500 mt-2">⚠️ {errorMsg}</p>}
            </div>
          </div>
        )}

        {/* あしあと: ヘッダー */}
        {activeTab === "history" && visitedPlaces.length > 0 && (
          <div className="mb-4 bg-white rounded-2xl p-4 border border-rose-50 shadow-sm text-center">
            <p className="text-2xl">👣</p>
            <p className="text-sm font-semibold text-gray-700 mt-1">二人の思い出スポット</p>
            <p className="text-xs text-gray-400">{visitedPlaces.length}箇所を一緒に訪れました</p>
          </div>
        )}

        {/* 初期ローディング */}
        {isInitialLoading && (
          <div className="text-center py-16">
            <p className="text-3xl animate-bounce">🦤</p>
            <p className="text-sm mt-2 text-gray-400">データを読み込み中...</p>
          </div>
        )}

        {/* Gemini生成中ローディング */}
        {!isInitialLoading && isLoading && activeTab === "plan" && <LoadingCard />}

        {/* カード一覧 */}
        {!isInitialLoading && !isLoading && displayedPlaces.length > 0 && (
          <div className="flex flex-col gap-3">
            {displayedPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                onFavorite={handleFavorite}
                onVisited={handleVisited}
                onVisit={handleVisit}
              />
            ))}
          </div>
        )}

        {/* 空状態 */}
        {!isInitialLoading && !isLoading && displayedPlaces.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            {activeTab === "plan" ? (
              <>
                <p className="text-4xl mb-3">🦤</p>
                <p className="text-sm font-medium text-gray-500">上の「気分ボタン」を押して</p>
                <p className="text-sm text-gray-400">ハシビロコウにデートプランを聞いてみよう！</p>
              </>
            ) : (
              <>
                <p className="text-4xl mb-3">🌸</p>
                <p className="text-sm">まだここには何もありません</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
