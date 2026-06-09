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

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json();
    if (!mood) {
      return NextResponse.json({ error: "mood is required" }, { status: 400 });
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("role, home_station");
    if (usersError) throw usersError;

    const me = users?.find((u) => u.role === "me");
    const partner = users?.find((u) => u.role === "partner");
    const stationA = me?.home_station ?? "目黒駅";
    const stationB = partner?.home_station ?? "東京駅";

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const basePrompt = `
あなたは東京のデートスポットに詳しいプランナーです。
以下の条件でカップルのデートプランを提案してください。

【条件】
- 出発地A: ${stationA}
- 出発地B: ${stationB}
- 今日の気分: ${mood}

【提案の要件】
1. 両駅からアクセスが良い中間エリアを1つ特定する
2. そのエリアで気分に合った**チェーン店以外**の飲食店を、異なるカテゴリ（イタリアン・和食・中華・フレンチ・ビストロ等）から各カテゴリ2〜3店舗、合計8〜10店舗提案する
3. 同エリアのデートスポット（公園・美術館・商業施設等）を2〜3箇所提案する
4. comment は二人へのテンション高めな日本語コメント
5. business_hours・payment_methods が不明な場合は「要確認」
`;

    const groundingPrompt = basePrompt + `
6. 各レストランは食べログで実際に検索し、実在するタベログページURL（https://tabelog.com/ で始まる）を tabelog_url に入れること
7. デートスポットの tabelog_url には公式サイトまたはGoogleマップURLを入れること

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
      type: p.type,
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
