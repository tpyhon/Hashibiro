import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Gemini API エラーやその他のオブジェクトからメッセージを抽出
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.code === "string") return `API error: ${e.code}`;
    return JSON.stringify(e);
  }
  return String(err);
}

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return codeBlock[1];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function sanitizeUrl(url: string | undefined, name: string, type: string): string {
  if (url) {
    const lower = url.toLowerCase();
    if (
      (lower.startsWith("https://tabelog.com/") && !lower.includes("rst_search")) ||
      lower.startsWith("https://www.google.com/maps")
    ) {
      return url;
    }
  }
  if (type === "restaurant") {
    return `https://tabelog.com/rstLst/?sk=${encodeURIComponent(name)}`;
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}`;
}

// responseSchema（grounding なしの構造化出力）
const placeSchema = {
  type: Type.OBJECT,
  properties: {
    area: { type: Type.STRING },
    places: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["restaurant", "date_spot"] },
          category: { type: Type.STRING },
          budget: { type: Type.STRING },
          business_hours: { type: Type.STRING },
          payment_methods: { type: Type.STRING },
          tabelog_url: { type: Type.STRING },
          comment: { type: Type.STRING },
        },
        required: ["name", "type", "category", "budget", "business_hours", "payment_methods", "comment"],
      },
    },
  },
  required: ["area", "places"],
};

type PlaceData = {
  area: string;
  places: Array<{
    name: string;
    type: string;
    category: string;
    budget: string;
    business_hours: string;
    payment_methods: string;
    tabelog_url?: string;
    comment: string;
  }>;
};

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

const DAY_OF_WEEK = ["日", "月", "火", "水", "木", "金", "土"];

async function fetchWeather(date: string): Promise<string> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) return "天気不明";
    const json = await res.json();
    const daily = json.daily;
    if (!daily || !daily.weather_code?.[0]) return "天気不明";
    const code: number = daily.weather_code[0];
    const tMax: number = Math.round(daily.temperature_2m_max[0]);
    const tMin: number = Math.round(daily.temperature_2m_min[0]);
    const rain: number = Math.round(daily.precipitation_sum[0] * 10) / 10;
    const weatherDesc = WMO_CODES[code] ?? "天気不明";
    return `${weatherDesc}（最高${tMax}℃ / 最低${tMin}℃ / 降水量${rain}mm）`;
  } catch {
    return "天気不明";
  }
}

function getCrowdLevel(date: string, timePeriod: string): string {
  const d = new Date(date + "T12:00:00+09:00");
  const dow = d.getDay();
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend && timePeriod === "lunch") return "非常に混雑しやすい（週末ランチ）";
  if (isWeekend && timePeriod === "afternoon") return "混雑しやすい（週末午後）";
  if (isWeekend && timePeriod === "dinner") return "混雑しやすい（週末ディナー）";
  if (!isWeekend && timePeriod === "lunch") return "やや混雑（平日ランチ）";
  if (!isWeekend && timePeriod === "afternoon") return "比較的空いている（平日午後）";
  return "やや混雑（平日ディナー）";
}

function formatDate(date: string): string {
  const d = new Date(date + "T12:00:00+09:00");
  const dow = DAY_OF_WEEK[d.getDay()];
  return `${date}（${dow}曜日）`;
}

const TIME_PERIOD_LABELS: Record<string, string> = {
  lunch: "ランチ（11:00〜14:00）",
  afternoon: "午後のデート（14:00〜18:00）",
  dinner: "ディナー（18:00〜22:00）",
};

export async function POST(req: NextRequest) {
  try {
    const { mood, date, timePeriod } = await req.json();
    if (!mood) {
      return NextResponse.json({ error: "mood is required" }, { status: 400 });
    }

    const dateStr = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const period = timePeriod ?? "dinner";

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("role, home_station");
    if (usersError) throw usersError;

    const me = users?.find((u) => u.role === "me");
    const partner = users?.find((u) => u.role === "partner");
    const stationA = me?.home_station ?? "目黒駅";
    const stationB = partner?.home_station ?? "東京駅";

    const [weather] = await Promise.all([fetchWeather(dateStr)]);
    const crowdLevel = getCrowdLevel(dateStr, period);
    const dateLabel = formatDate(dateStr);
    const periodLabel = TIME_PERIOD_LABELS[period] ?? period;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const basePrompt = `
あなたは東京のデートスポットに詳しいプランナーです。
以下の条件でカップルのデートプランを提案してください。

【条件】
- 出発地A: ${stationA}
- 出発地B: ${stationB}
- デートの日時: ${dateLabel} ${periodLabel}
- 天気予報: ${weather}
- 混雑予測: ${crowdLevel}
- 今日の気分: ${mood}

【提案の要件】
1. 両駅からアクセスが良い中間エリアを1つ特定する
2. そのエリアで気分に合った**チェーン店以外**の飲食店を、異なるカテゴリ（イタリアン・和食・中華・フレンチ・ビストロ等）から各カテゴリ2〜3店舗、合計8〜10店舗提案する
3. 同エリアのデートスポット（公園・美術館・商業施設等）を2〜3箇所提案する
4. 天気・混雑状況を考慮した提案をする（雨天なら屋内中心、混雑しやすい時は予約できる店を優先など）
5. comment は天気や混雑を踏まえた二人へのテンション高めな日本語コメント
6. business_hours・payment_methods が不明な場合は「要確認」
`;

    const groundingPrompt = basePrompt + `
7. 各レストランは食べログで実際に検索し、実在するタベログページURL（https://tabelog.com/ で始まる）を tabelog_url に入れること
8. デートスポットの tabelog_url には公式サイトまたはGoogleマップURLを入れること

必ず以下のJSONのみで返答すること（マークダウン・説明文不要）:
{"area":"エリア名","places":[{"name":"店名","type":"restaurant","category":"カテゴリ","budget":"¥3,000〜","business_hours":"時間","payment_methods":"支払い","tabelog_url":"https://tabelog.com/...","comment":"コメント"}]}
`;

    let generated: PlaceData | null = null;

    // 1st try: grounding で実在URLを取得
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: groundingPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const text = response.text ?? "";
      if (text) {
        const jsonStr = extractJson(text);
        generated = JSON.parse(jsonStr) as PlaceData;
      }
    } catch (groundingErr) {
      console.warn("grounding failed, falling back to structured output:", extractErrorMessage(groundingErr));
    }

    // 2nd try: responseSchema（grounding なし、確実に構造化）
    if (!generated) {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: basePrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: placeSchema,
        },
      });
      const text = response.text ?? "";
      if (!text) throw new Error("Gemini returned empty response");
      generated = JSON.parse(text) as PlaceData;
    }

    // 既存の suggested を削除して新規挿入
    const { error: deleteError } = await supabase
      .from("places")
      .delete()
      .eq("status", "suggested");
    if (deleteError) throw deleteError;

    const records = generated.places.map((p) => ({
      name: p.name,
      type: p.type === "date_spot" ? "date_spot" : "restaurant",
      category: p.category,
      budget: p.budget,
      business_hours: p.business_hours,
      payment_methods: p.payment_methods,
      tabelog_url: sanitizeUrl(p.tabelog_url, p.name, p.type),
      comment: p.comment,
      status: "suggested",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("places")
      .insert(records)
      .select();
    if (insertError) throw insertError;

    return NextResponse.json({ area: generated.area, places: inserted });
  } catch (err) {
    console.error("generate error:", err);
    return NextResponse.json(
      { error: extractErrorMessage(err) },
      { status: 500 }
    );
  }
}
