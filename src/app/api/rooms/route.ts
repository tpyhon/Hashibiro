import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateCode(): string {
  // 紛らわしい文字 (0/O, 1/I) を除いた6文字コード
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  try {
    const { action, code, nickname, homeStation, deviceId } = await req.json();

    if (!nickname || !homeStation || !deviceId) {
      return NextResponse.json({ error: "nickname, homeStation, deviceId are required" }, { status: 400 });
    }

    if (action === "create") {
      // コードが衝突しないまで試みる
      let roomCode = "";
      let room = null;
      for (let i = 0; i < 5; i++) {
        roomCode = generateCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({ code: roomCode })
          .select()
          .single();
        if (!error && data) { room = data; break; }
      }
      if (!room) throw new Error("Failed to generate unique room code");

      const { data: user, error: userError } = await supabase
        .from("users")
        .insert({ room_id: room.id, device_id: deviceId, nickname, home_station: homeStation })
        .select()
        .single();
      if (userError) throw userError;

      return NextResponse.json({ room, user });

    } else if (action === "join") {
      if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select()
        .eq("code", code.toUpperCase().trim())
        .single();
      if (roomError || !room) {
        return NextResponse.json({ error: "ルームが見つかりません。コードを確認してください。" }, { status: 404 });
      }

      // 同デバイスがすでにこのルームにいる場合は既存ユーザーを返す
      const { data: existing } = await supabase
        .from("users")
        .select()
        .eq("room_id", room.id)
        .eq("device_id", deviceId)
        .single();
      if (existing) {
        return NextResponse.json({ room, user: existing });
      }

      // 定員チェック（1ルーム2人まで）
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id);
      if ((count ?? 0) >= 2) {
        return NextResponse.json({ error: "このルームはすでに満員です（2人まで）。" }, { status: 409 });
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .insert({ room_id: room.id, device_id: deviceId, nickname, home_station: homeStation })
        .select()
        .single();
      if (userError) throw userError;

      return NextResponse.json({ room, user });

    } else {
      return NextResponse.json({ error: "action must be 'create' or 'join'" }, { status: 400 });
    }
  } catch (err) {
    console.error("rooms error:", err);
    const msg = err instanceof Error ? err.message : "エラーが発生しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// デバイスIDでそのデバイスが参加しているルーム一覧を取得
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ rooms: [] });

  const { data: userRows } = await supabase
    .from("users")
    .select("room_id, rooms(id, code, created_at)")
    .eq("device_id", deviceId);

  const rooms = (userRows ?? [])
    .map((u: { room_id: string; rooms: unknown }) => u.rooms)
    .filter(Boolean);

  return NextResponse.json({ rooms });
}
