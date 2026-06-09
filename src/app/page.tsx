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

const MOODS = [
  "🍝 がっつり食べたい",
  "☕ まったりしたい",
  "🌿 外を歩きたい",
  "🎨 文化的な体験",
  "🍣 和食気分",
];

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
};

function categoryColor(cat: string) {
  return categoryColors[cat] ?? "bg-gray-100 text-gray-600";
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 inset-x-4 z-50 flex justify-center pointer-events-none">
      <div className="bg-rose-500 text-white text-sm px-5 py-3 rounded-2xl shadow-xl max-w-sm text-center leading-6">
        {message}
      </div>
    </div>
  );
}

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
          title={isFav ? "お気に入り解除" : "お気に入り"}
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentArea, setCurrentArea] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadPlaces = useCallback(async () => {
    const { data } = await supabase
      .from("places")
      .select("*")
      .order("created_at", { ascending: false });
    setPlaces((data as Place[]) ?? []);
  }, []);

  useEffect(() => {
    loadPlaces().finally(() => setIsInitialLoading(false));
  }, [loadPlaces]);

  const handleFavorite = async (id: number) => {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    const newStatus: Status = place.status === "favorite" ? "suggested" : "favorite";
    // 楽観的更新
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    await supabase.from("places").update({ status: newStatus }).eq("id", id);
  };

  const handleVisited = async (id: number) => {
    // 楽観的更新
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
        body: JSON.stringify({ mood: newMood }),
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

  // タブ別データ
  const planPlaces = places.filter((p) => p.status === "suggested" || p.status === "favorite");
  const favoritePlaces = places.filter((p) => p.status === "favorite");
  const visitedPlaces = places.filter((p) => p.status === "visited"); // DB側でcreated_at降順済み

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

      {/* ヘッダー */}
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-rose-500 tracking-tight">
              Hashibiro 🦤
            </h1>
            <div className="text-xs text-gray-500 text-right leading-5">
              <p>🚉 目黒駅 ↔ 東京駅</p>
              {currentArea ? (
                <p className="text-rose-400 font-medium">📍 {currentArea}</p>
              ) : (
                <p className="text-rose-400 font-medium">中間地点を探索中…</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
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
                <span
                  className={`text-[10px] mt-0.5 px-1.5 rounded-full ${
                    activeTab === key ? "bg-white/30 text-white" : "bg-rose-100 text-rose-500"
                  }`}
                >
                  {count}件
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 作戦会議: 気分ボタン */}
        {activeTab === "plan" && (
          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">今日の気分は？</p>
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
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl animate-spin">🦤</p>
            <p className="text-sm mt-2">データを読み込み中...</p>
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
