import { ref } from "vue";
import { load, persistRef } from "./persist";

// Reusable author profiles: a display name, a link and an avatar. One profile
// can be applied as the webhook identity (username + avatar) or as an embed's
// author block (name + url + icon), so the same brand is set up once.

export interface Author {
  id: string;
  name: string;
  url: string;
  avatarUrl: string;
  createdAt: string;
}

export type AuthorInput = { name: string; url?: string; avatarUrl?: string };

export const savedAuthors = ref<Author[]>(load<Author[]>("authors", []));
persistRef("authors", savedAuthors);

function newId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAuthor(id: string | null | undefined): Author | undefined {
  return id ? savedAuthors.value.find((a) => a.id === id) : undefined;
}

export function addAuthor(input: AuthorInput): Author {
  const a: Author = {
    id: newId(),
    name: input.name.trim(),
    url: (input.url ?? "").trim(),
    avatarUrl: (input.avatarUrl ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  savedAuthors.value.push(a);
  return a;
}

export function updateAuthor(id: string, patch: Partial<AuthorInput>) {
  const a = getAuthor(id);
  if (!a) return;
  if (patch.name !== undefined) a.name = patch.name.trim() || a.name;
  if (patch.url !== undefined) a.url = patch.url.trim();
  if (patch.avatarUrl !== undefined) a.avatarUrl = patch.avatarUrl.trim();
}

export function deleteAuthor(id: string) {
  savedAuthors.value = savedAuthors.value.filter((a) => a.id !== id);
}

// The authors dialog can be opened from several places (toolbar, webhook
// identity, any embed), optionally prefilled with values already typed in.
export const authorsDialog = ref<{ prefill: Partial<AuthorInput> } | null>(null);

export function openAuthors(prefill: Partial<AuthorInput> = {}) {
  authorsDialog.value = { prefill };
}

export function closeAuthors() {
  authorsDialog.value = null;
}
