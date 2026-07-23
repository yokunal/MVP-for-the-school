import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

type Body = {
  messages: ChatMsg[];
};

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
];

/**
 * POST /api/chat/:bookId
 *
 * Body: { messages: [{ role, content }] }
 *
 * Uses Gemini with book metadata — no plot summaries, only entices reading.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const book = await prisma.book.findFirst({
    where: { id: ctx.params.bookId, deletedAt: null },
    select: {
      id: true, title: true, author: true, subject: true, synopsis: true, library: true,
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const cleaned: ChatMsg[] = messages
    .filter((m): m is ChatMsg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-20);

  const system = buildSystemPrompt(book);

  const history = cleaned.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMsg = cleaned[cleaned.length - 1];
  if (!lastMsg) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history, { role: "user", parts: [{ text: lastMsg.content }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  ],
  };

  // Try models in order until one works
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
      );

      if (res.status === 429 || res.status === 503) continue; // quota/overload — try next
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 404) continue; // model not found — try next
        return NextResponse.json(
          { error: `Chat service error (${res.status}): ${text.slice(0, 200)}` },
          { status: 502 }
        );
      }

      const raw = await res.text();
      let data: any;
      try { data = JSON.parse(raw); } catch {
        return NextResponse.json({ error: "Invalid JSON from Gemini" }, { status: 502 });
      }

      console.log("[gemini]", JSON.stringify({ model, finishReason: data.candidates?.[0]?.finishReason, partsCount: data.candidates?.[0]?.content?.parts?.length }));

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Collect all text from all parts (Gemini may split across parts)
      const reply = parts
        .filter((p: any) => typeof p.text === "string")
        .map((p: any) => p.text)
        .join("")
        .trim()
        || "I don't have a response for that right now.";

      return NextResponse.json({ reply });
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: "All Gemini models unavailable. Try again later or add a billing account." },
    { status: 503 }
  );
}

function buildSystemPrompt(book: {
  title: string; author: string; subject: string; synopsis: string;
}): string {
  return [
    "You are a reading companion for one specific book in a school digital library.",
    "",
    "YOUR JOB:",
    "- Read the book metadata below (title, author, synopsis).",
    "- Give brief, interesting answers that make the user curious to read the book.",
    "",
    "STRICT RULES:",
    "- NEVER summarize the plot, story, or content of the book.",
    "- NEVER reveal spoilers, endings, or key plot points.",
    "- If user asks 'what happens?' or 'tell me the story', say:",
    "  'That's something you'll discover when you read the book!'",
    "- Keep replies short but complete — around 2-4 sentences.",
    "- Only answer things relevant to THIS specific book.",
    "- Don't make things up.",
    "",
    "--- book metadata ---",
    "Title: " + book.title,
    "Author: " + book.author,
    "Subject: " + book.subject,
    "Synopsis: " + book.synopsis,
    "--- end metadata ---",
  ].join("\n");
}
