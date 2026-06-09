"use client";

import { useState } from "react";

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
}

const initialPlaces: Place[] = [
  {
    id: 1,
    name: "トラットリア アルポルト",
    type: "restaurant",
    category: "イタリアン",
    status: "suggested",
    budget: "¥3,000〜¥5,000",
    business_hours: "11:30〜14:00 / 18:00〜22:00",
    payment_methods: "カード・PayPay可",
    tabelog_url: "https://tabelog.com",
    comment: "パスタが絶品らしい！",
  },
  {
    id: 2,
    name: "中目黒 蔦屋書店",
    type: "date_spot",
    category: "カフェ・本屋",
    status: "favorite",
    budget: "〜¥1,000",
    business_hours: "7:00〜23:00",
    payment_methods: "カード・各種Pay可",
    tabelog_url: "https://tabelog.com",
    comment: "雨の日にゆっくりしたい",
  },
  {
    id: 3,
    name: "新宿御苑",
    type: "date_spot",
    category: "公園",
    status: "visited",
    budget: "¥500（入園料）",
    business_hours: "9:00〜16:30",
    payment_methods: "現金・Suica可",
    tabelog_url: "https://www.env.go.jp/garden/shinjukugyoen/",
    comment: "桜の季節にまた来たい🌸",
  },
  {
    id: 4,
    name: "bistro 渋谷",
    type: "restaurant",
    category: "フレンチ",
    status: "favorite",
    budget: "¥4,000〜¥6,000",
    business_hours: "18:00〜23:00",
    payment_methods: "カード可",
    tabelog_url: "https://tabelog.com",
    comment: "記念日に行こう",
  },
  {
    id: 5,
    name: "恵比寿ガーデンプレイス",
    type: "date_spot",
    category: "ショッピング・散歩",
    status: "visited",
    budget: "自由",
    business_hours: "11:00〜21:00",
    payment_methods: "店舗により異なる",
    tabelog_url: "https://gardenplace.jp",
    comment: "クリスマスのイルミきれいだった✨",
  },
];

const MOODS = ["🍝 がっつり食べたい", "☕ まったりしたい", "🌿 外を歩きたい", "🎨 文化的な体験", "🍣 和食気分"];

const categoryColors: Record<string, string> = {
  "イタリアン": "bg-orange-100 text-orange-700",
  "カフェ・本屋": "bg-amber-100 text-amber-700",
  "公園": "bg-green-100 text-green-700",
  "フレンチ": "bg-blue-100 text-blue-700",
  "ショッピング・散歩": "bg-purple-100 text-purple-700",
};

function PlaceCard({
  place,
  onFavorite,
  onVisited,
}: {
  place: Place;
  onFavorite: (id: number) => void;
  onVisited: (id: number) => void;
}) {
  const isFav = place.status === "favorite";
  const isVisited = place.status === "visited";
  const colorClass = categoryColors[place.category] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-50 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-base leading-tight">{place.name}</h3>
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
            {place.category}
          </span>
        </div>
        <button
          onClick={() => onFavorite(place.id)}
          className={`text-xl transition-transform hover:scale-110 ${isFav ? "text-rose-500" : "text-gray-300"}`}
          title="お気に入り"
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
        <a
          href={place.tabelog_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center text-xs font-medium bg-rose-500 text-white rounded-full py-2 hover:bg-rose-600 transition-colors"
        >
          ここにする！ 🗺️
        </a>
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const handleFavorite = (id: number) => {
    setPlaces((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: p.status === "favorite" ? "suggested" : "favorite" } : p
      )
    );
  };

  const handleVisited = (id: number) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "visited" } : p))
    );
  };

  const suggestedPlaces = places.filter((p) => p.status === "suggested");
  const favoritePlaces = places.filter((p) => p.status === "favorite");
  const visitedPlaces = places.filter((p) => p.status === "visited");

  const tabs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "plan", label: "作戦会議", icon: "🗓️", count: suggestedPlaces.length },
    { key: "favorite", label: "お気に入り", icon: "❤️", count: favoritePlaces.length },
    { key: "history", label: "あしあと", icon: "👣", count: visitedPlaces.length },
  ];

  const displayedPlaces =
    activeTab === "plan"
      ? suggestedPlaces
      : activeTab === "favorite"
      ? favoritePlaces
      : visitedPlaces;

  return (
    <div className="min-h-screen bg-rose-25 font-sans" style={{ backgroundColor: "#fff8f8" }}>
      {/* ヘッダー */}
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-rose-500 tracking-tight">
              Hashibiro 🦤
            </h1>
            <div className="text-xs text-gray-500 text-right leading-5">
              <p>🚉 目黒駅 ↔ 東京駅</p>
              <p className="text-rose-400 font-medium">中間地点を探索中…</p>
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

        {/* 作戦会議タブ: 気分ボタン */}
        {activeTab === "plan" && (
          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-600 mb-2">今日の気分は？</p>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  onClick={() => setSelectedMood(mood === selectedMood ? null : mood)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedMood === mood
                      ? "bg-rose-500 text-white border-rose-500"
                      : "bg-white text-gray-600 border-rose-200 hover:border-rose-400"
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
            {selectedMood && (
              <p className="text-xs text-rose-400 mt-2">「{selectedMood}」で絞り込み中</p>
            )}
          </div>
        )}

        {/* あしあとタブ: ヘッダー */}
        {activeTab === "history" && (
          <div className="mb-4 bg-white rounded-2xl p-4 border border-rose-50 shadow-sm text-center">
            <p className="text-2xl">👣</p>
            <p className="text-sm font-semibold text-gray-700 mt-1">二人の思い出スポット</p>
            <p className="text-xs text-gray-400">{visitedPlaces.length}箇所を一緒に訪れました</p>
          </div>
        )}

        {/* カード一覧 */}
        {displayedPlaces.length > 0 ? (
          <div className="flex flex-col gap-3">
            {displayedPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                onFavorite={handleFavorite}
                onVisited={handleVisited}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🌸</p>
            <p className="text-sm">まだここには何もありません</p>
          </div>
        )}
      </div>
    </div>
  );
}
