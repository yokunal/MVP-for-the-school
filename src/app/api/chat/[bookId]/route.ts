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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-3-5-sonnet-latest";
const MAX_TOKENS = 600;

/**
 * POST /api/chat/:bookId
 *
 * Body: { messages: [{ role, content }] }
 *
 * Returns: { reply: string }
 *
 * The chatbot is scoped to a single book. The system prompt is built from the
 * book's stored metadata ONLY — title, author, subject, synopsis. The model
 * is told up front that it has not read the book, so questions that the
 * metadata doesn't answer will be acknowledged as such.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const book = await prisma.book.findUnique({
    where: { id: ctx.params.bookId },
    select: {
      id: true,
      title: true,
      author: true,
      subject: true,
      synopsis: true,
      library: true,
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const cleaned: ChatMsg[] = messages
    .filter(
      (m): m is ChatMsg =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-20); // cap context length

  const system = buildSystemPrompt(book);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: cleaned.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Chat service error: ${res.status} ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const reply =
      data.content
        ?.filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n")
        .trim() ||
      "I don't have a response for that right now.";

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach the chat service: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

function buildSystemPrompt(book: {
  title: string;
  author: string;
  subject: string;
  synopsis: string;
}): string {
  return [
    `You are a reading companion for one specific book in a school digital library.`,
    ``,
    `Your sole source of information is the book's metadata below. You have NOT`,
    `read the book — you only know what is written here. If the user asks`,
    `something the metadata doesn't cover (plot points, characters, themes,`,
    `chapter-level detail, quotes, page numbers, illustrations, etc.), say so`,
    `clearly and briefly. Suggest they read the relevant section.`,
    ``,
    `--- book metadata ---`,
    `Title: ${book.title}`,
    `Author: ${book.author}`,
    `Subject: ${book.subject}`,
    `Synopsis: ${book.synopsis}`,
    `--- end metadata ---`,
    ``,
    `Style rules:`,
    `- Be concise. Keep replies under ~120 words unless a list is clearly useful.`,
    `- Quote the metadata fields when relevant so the student can verify.`,
    `- Never invent content, page references, or external sources.`,
  ].join("\n");
}
