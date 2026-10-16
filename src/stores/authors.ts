import { ref } from "vue";
import { orgCollection } from "./orgCollection";

// Reusable author profiles: a display name, a link and an avatar. One profile
// can be applied as the webhook identity (username + avatar) or as an embed's
// author block (name + url + icon), so the same brand is set up once.
// Shared with every member of the active org.

export interface Author {
  id: string;
  name: string;
  url: string;
  avatarUrl: string;
  createdAt: string;
}

export type AuthorInput = { name: string; url?: string; avatarUrl?: string };

const store = orgCollection<Author>("authors");
export const savedAuthors = store.items;

export function getAuthor(id: string | null | undefined): Author | undefined {
  return id ? savedAuthors.value.find((a) => a.id === id) : undefined;
}

export function addAuthor(input: AuthorInput): Author {
  const a: Author = {
    id: store.newId(),
    name: input.name.trim(),
    url: (input.url ?? "").trim(),
    avatarUrl: (input.avatarUrl ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  store.set(a);
  return a;
}

export function updateAuthor(id: string, patch: Partial<AuthorInput>) {
  const a = getAuthor(id);
  if (!a) return;
  const out: Partial<Author> = {};
  if (patch.name !== undefined) out.name = patch.name.trim() || a.name;
  if (patch.url !== undefined) out.url = patch.url.trim();
  if (patch.avatarUrl !== undefined) out.avatarUrl = patch.avatarUrl.trim();
  store.update(id, out);
}

export function deleteAuthor(id: string) {
  store.remove(id);
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
