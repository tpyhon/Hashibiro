import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const placeSchema = {
  type: Type.OBJECT,
  properties: {
    area: { type: Type.STRING, description: "二人の中間エリア名（例: 渋谷、恵比寿）" },
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
        required: ["name", "type", "category", "budget", "business_hours", "payment_methods", "tabelog_url", "comment"],
      },
    },
  },
  required: ["area", "places"],
};

export async function POST(req: NextRequest) {
  try {
    const { mood } = await req.json();
    if (!mood) {
      return NextResponse.json({ error: "mood is required" }, { status: 400 });
    }

    // DBから2人の最寄り駅を取得
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("name, role, home_station");
    if (usersError) throw usersError;

    const me = users?.find((u) => u.role === "me");
    const partner = users?.find((u) => u.role === "partner");
    const stationA = me?.home_station ?? "目黒駅";
    const stationB = partner?.home_station ?? "東京駅";

    // Gemini APIを呼び出し
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const prompt = `
あなたは東京のデートスポットに詳しいプランナーです。
以下の条件で、カップルのデートプランを提案してください。

【条件】
- 出発地A: ${stationA}
- 出発地B: ${stationB}
- 今日の気分: ${mood}

【提案の要件】
1. 両駅からアクセスが良い中間エリアを1つ特定する
2. そのエリアにある**チェーン店以外**の評価が高い飲食店を4〜5店舗、気分に合わせて異なるカテゴリ（イタリアン、和食、中華など）で提案する
3. 同エリアにある飲食店以外のデートスポット（公園、美術館、商業施設など）を1〜2箇所提案する（type: "date_spot"）
4. 各スポットの情報を正確に記入する
   - tabelog_url: 食べログ検索URL "https://tabelog.com/rst/rst_search?sk=店名" またはスポットの公式URL
   - comment: 二人に向けた一言おすすめポイント（日本語、テンション高め）
   - business_hours: 営業時間（わからない場合は「要確認」）
   - payment_methods: 支払い方法（わからない場合は「要確認」）
5. すべて日本語で回答すること

JSONフォーマットで返答してください。
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: placeSchema,
      },
    });

    const text = response.text ?? null;
    if (!text) throw new Error("Gemini returned empty response");

    const generated = JSON.parse(text) as {
      area: string;
      places: Array<{
        name: string;
        type: string;
        category: string;
        budget: string;
        business_hours: string;
        payment_methods: string;
        tabelog_url: string;
        comment: string;
      }>;
    };

    // 既存のsuggested データを削除してから新規挿入
    const { error: deleteError } = await supabase
      .from("places")
      .delete()
      .eq("status", "suggested");
    if (deleteError) throw deleteError;

    const records = generated.places.map((p) => ({
      ...p,
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
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
