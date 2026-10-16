import { ref, computed, watch } from "vue";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { load } from "./persist";
import { activeOrgId, canManage, user } from "./session";

// Guests (and everyone before Firebase) keep webhooks, servers, authors and
// drafts in this browser's localStorage. Once signed in, this offers a copy
// into the active org.
// Ids are kept, so links between them (and the editor's current draft and
// selected webhook) survive, and importing twice just overwrites.

const KEYS = ["servers", "webhooks", "authors", "drafts"] as const;
type Key = (typeof KEYS)[number];
/** Only admins may write these, so members leave them behind. */
const ADMIN_ONLY: Key[] = ["servers", "webhooks"];

function read(): Record<Key, { id: string }[]> {
  const out = {} as Record<Key, { id: string }[]>;
  for (const k of KEYS) {
    const v = load<unknown>(k, []);
    out[k] = Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
  }
  return out;
}

const legacy = ref(read());
// A guest may have added data since load; look again whenever someone signs in or out.
watch(user, () => (legacy.value = read()));

export const legacyCounts = computed(() => {
  const c = {} as Record<Key, number>;
  for (const k of KEYS) c[k] = legacy.value[k].length;
  return c;
});
export const hasLegacyData = computed(() => KEYS.some((k) => legacy.value[k].length > 0));

/** Copy local data into the active org, then remove what was copied. Returns how many items moved. */
export async function importLegacyData(): Promise<number> {
  const orgId = activeOrgId.value;
  if (!orgId) throw new Error("No organization selected");
  const keys = KEYS.filter((k) => canManage.value || !ADMIN_ONLY.includes(k));
  const writes = keys.flatMap((k) => legacy.value[k].map((item) => ({ k, item })));

  // Firestore batches cap at 500 writes.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    for (const { k, item } of writes.slice(i, i + 400)) {
      const { id, ...data } = item;
      batch.set(doc(db, "orgs", orgId, k, id), data);
    }
    await batch.commit();
  }
  for (const k of keys) localStorage.removeItem(`discord-publisher:${k}`);
  legacy.value = read();
  return writes.length;
}

export function discardLegacyData() {
  for (const k of KEYS) localStorage.removeItem(`discord-publisher:${k}`);
  legacy.value = read();
}
