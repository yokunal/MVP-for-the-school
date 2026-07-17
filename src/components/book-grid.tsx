"use client";

import { useMemo, useState } from "react";
import { BookCard, type BookCardData } from "@/components/book-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type LibraryBookFilterProps = {
  books: BookCardData[];
  subjects: string[];
  authors: string[];
};

export function LibraryBookFilter({
  books,
  subjects,
  authors,
}: LibraryBookFilterProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("__all__");
  const [author, setAuthor] = useState("__all__");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (subject !== "__all__" && b.subject !== subject) return false;
      if (author !== "__all__" && b.author !== author) return false;
      if (q) {
        const hay = `${b.title} ${b.author} ${b.subject}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [books, query, subject, author]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author, subject…"
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="All authors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All authors</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No books match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Showing {filtered.length} of {books.length} books
      </p>
    </>
  );
}
