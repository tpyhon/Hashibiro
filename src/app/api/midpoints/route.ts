import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const areaSchema = {
  type: Type.OBJECT,
  properties: {
    areas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          access: { type: Type.STRING },
        },
        required: ["name", "description", "access"],
      },
    },
  },
  required: ["areas"],
};

export async function POST(req: NextRequest) {
  try {
    const { stationA, stationB } = await req.json();
    if (!stationA || !stationB) {
      return NextResponse.json({ error: "stations required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `
${stationA}と${stationB}の両駅の中間にあり、カップルのデートに最適な東京のエリア・駅を5つ提案してください。
各エリアについて以下を記載してください：
- name: エリア名（駅名や地名。例：恵比寿、代官山、中目黒など）
- description: そのエリアのデートに向いている特徴（具体的な雰囲気・強み。30文字以内）
- access: 両駅からのおおよその所要時間（例：${stationA}から5分・${stationB}から10分）
`,
      config: {
        responseMimeType: "application/json",
        responseSchema: areaSchema,
      },
    });

    const text = response.text ?? "";
    if (!text) throw new Error("Empty response");
    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    console.error("midpoints error:", err);
    return NextResponse.json({ error: "Failed to fetch midpoints" }, { status: 500 });
  }
}
