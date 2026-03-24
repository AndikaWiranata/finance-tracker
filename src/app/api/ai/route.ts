import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const BASE_URL = "https://generativelanguage.googleapis.com";

// Cache model name at module level - only discover once per server lifecycle
let cachedModel: string | null = null;

const PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
];

async function getModel(apiKey: string): Promise<string | null> {
  if (cachedModel) {
    console.log("[AI Advisor] Using cached model:", cachedModel);
    return cachedModel;
  }

  try {
    const res = await fetch(`${BASE_URL}/v1beta/models?key=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    const supported: string[] = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => m.name as string);

    console.log("[AI Advisor] Available models:", supported);

    for (const p of PRIORITY) {
      const match = supported.find((m) => m.includes(p));
      if (match) { cachedModel = match; return match; }
    }
  } catch (e) {
    console.log("[AI Advisor] ListModels failed:", e);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
  if (!API_KEY) return NextResponse.json({ status: "missing_key" }, { status: 401 });
  
  const model = await getModel(API_KEY);
  return NextResponse.json({ status: model ? "active" : "error", model });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const API_KEY = process.env.GEMINI_API_KEY?.trim() || "";

  try {
    const { message, context } = await req.json();

    const prompt = `Kamu adalah AI Financial Advisor. Analisis data keuangan berikut dan jawab pertanyaan user.

DATA KEUANGAN USER:
- Total Kekayaan: IDR ${(context.netWorth || 0).toLocaleString("id-ID")}
- Tabungan/Bank: IDR ${(context.bankTotal || 0).toLocaleString("id-ID")}
- Portofolio Saham: IDR ${(context.stocksTotal || 0).toLocaleString("id-ID")}
- Aset Crypto: IDR ${(context.cryptoTotal || 0).toLocaleString("id-ID")}
- Akun Forex: IDR ${(context.forexTotal || 0).toLocaleString("id-ID")}

PERTANYAAN: "${message}"

ATURAN: Bahasa Indonesia profesional, tanpa emoji, gunakan format markdown.`;

    if (!API_KEY) {
      return NextResponse.json({ response: generateSmartAdvice(context) });
    }

    // Step 1 & 2: Get model (cached after first call)
    const selectedModel = await getModel(API_KEY);

    // Step 3: Call the selected model
    if (selectedModel) {
      const res = await fetch(
        `${BASE_URL}/v1beta/${selectedModel}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
        }
      );
      const data = await res.json();
      console.log("[AI Advisor] Generate status:", res.status);

      if (res.status === 429) {
        return NextResponse.json({
          response: `## Batas Permintaan Tercapai\n\nAPI Google sedang membatasi permintaan untuk sementara (rate limit). Ini terjadi karena terlalu banyak permintaan dalam waktu singkat.\n\n**Solusi:** Tunggu 1-2 menit lalu coba lagi. Biasanya batas ini tidak berlaku lama pada akun Free Tier.`,
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return NextResponse.json({ response: text });
    }

    console.log("[AI Advisor] All models failed, using local fallback");
    return NextResponse.json({ response: generateSmartAdvice(context) });

  } catch (err) {
    console.log("[AI Advisor] Unexpected error:", err);
    return NextResponse.json({ response: "Terjadi kesalahan. Silakan coba lagi." });
  }
}

function generateSmartAdvice(context: any): string {
  const netWorth = context.netWorth || 0;
  const bank = context.bankTotal || 0;
  const stocks = context.stocksTotal || 0;
  const crypto = context.cryptoTotal || 0;
  const forex = context.forexTotal || 0;

  const pct = (v: number) => netWorth > 0 ? ((v / netWorth) * 100).toFixed(1) + "%" : "0%";

  let advice = `## Analisis Keuangan Anda\n\n`;
  advice += `Total kekayaan tercatat **IDR ${netWorth.toLocaleString("id-ID")}**.\n\n`;
  advice += `### Komposisi Aset\n`;
  advice += `| Kategori | Nilai | Porsi |\n|---|---|---|\n`;
  advice += `| Bank/Tunai | IDR ${bank.toLocaleString("id-ID")} | ${pct(bank)} |\n`;
  advice += `| Saham | IDR ${stocks.toLocaleString("id-ID")} | ${pct(stocks)} |\n`;
  advice += `| Crypto | IDR ${crypto.toLocaleString("id-ID")} | ${pct(crypto)} |\n`;
  advice += `| Forex | IDR ${forex.toLocaleString("id-ID")} | ${pct(forex)} |\n\n`;

  advice += `### Rekomendasi\n`;
  if (bank < netWorth * 0.1 && netWorth > 0) advice += `- **Dana darurat rendah**: Aset tunai hanya ${pct(bank)} dari total. Idealnya minimal 10-20% dalam bentuk tunai.\n`;
  if (crypto > netWorth * 0.5 && crypto > 0) advice += `- **Risiko tinggi**: ${pct(crypto)} aset ada di Crypto yang sangat volatil. Pertimbangkan diversifikasi.\n`;
  if (stocks === 0 && netWorth > 5000000) advice += `- Dengan total kekayaan di atas Rp 5 juta, pertimbangkan mulai investasi reksa dana atau saham.\n`;
  if (bank > 0 && stocks === 0 && crypto === 0 && forex === 0) advice += `- Seluruh aset di Bank. Alokasikan 10-20% ke instrumen investasi untuk melawan inflasi.\n`;
  if (netWorth === 0) advice += `- Mulai catat aset dan akun keuangan Anda di menu Accounts.\n`;

  advice += `\n*Catatan: Analisis ini bersifat informatif. Untuk keputusan investasi besar, konsultasikan dengan perencana keuangan profesional.*`;
  return advice;
}
