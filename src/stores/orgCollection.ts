import { ref, watch, type Ref } from "vue";
import { collection, deleteDoc, deleteField, doc, onSnapshot, query, setDoc, updateDoc, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { activeOrgId, authReady, user } from "./session";
import { load, save } from "./persist";
import { toast } from "./toasts";

// A collection shared through the active org (orgs/{orgId}/{name}) mirrored
// into a reactive array. Writes update the array straight away so callers can
// keep treating stores as synchronous; the snapshot listener then confirms them.
//
// Guests (signed out) get the same API backed by localStorage under `name`.
// Those keys are what legacy.ts offers to import once the guest signs in.

export interface OrgCollection<T extends { id: string }> {
  items: Ref<T[]>;
  /** A fresh document id in this collection. */
  newId(): string;
  set(item: T): void;
  /** Patch fields; `undefined` values delete the field. */
  update(id: string, patch: Partial<Omit<T, "id">>): void;
  remove(id: string): void;
}

function localId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function orgCollection<T extends { id: string }>(
  name: string,
  opts: {
    /**
     * Filters for the Firestore listener, re-run when they change; null loads
     * nothing. For collections the rules only partly expose (rules aren't
     * filters, so the query must ask for exactly what's allowed). Return a
     * list of filter sets to run several queries and merge their results
     * (the rules can't verify some single queries, e.g. `in [ids..., null]`).
     */
    constraints?: () => QueryConstraint[] | QueryConstraint[][] | null;
    /** Plain value the constraints depend on; the listener restarts only when it changes. */
    constraintsKey?: () => string;
  } = {}
): OrgCollection<T> {
  const items = ref<T[]>([]) as Ref<T[]>;
  let stops: (() => void)[] = [];
  const guest = () => authReady.value && !user.value;

  // Local writes not yet confirmed by Firestore. Snapshots can arrive that were
  // taken before a write reached the (IndexedDB-backed) cache; without this,
  // a just-added item would vanish and reappear, or an edit briefly revert.
  // Each entry is dropped once its write settles, after which snapshots carry it.
  const pendingSets = new Map<string, T>();
  const pendingPatches = new Map<string, { patch: Record<string, unknown>; writes: number }>();
  const pendingRemoves = new Set<string>();
  let results: T[][] = [];

  /** Publish the union of the listeners' results with pending local writes on top. */
  function publish() {
    const byId = new Map<string, T>();
    for (const list of results) for (const item of list) byId.set(item.id, item);
    for (const [id, item] of pendingSets) byId.set(id, item);
    for (const [id, { patch }] of pendingPatches) {
      const item = byId.get(id);
      if (item) byId.set(id, { ...item, ...patch });
    }
    for (const id of pendingRemoves) byId.delete(id);
    items.value = [...byId.values()];
  }

  function clearPending() {
    pendingSets.clear();
    pendingPatches.clear();
    pendingRemoves.clear();
  }

  watch(
    [activeOrgId, guest, () => opts.constraintsKey?.() ?? ""],
    ([orgId, isGuest]) => {
      stops.forEach((f) => f());
      stops = [];
      clearPending();
      items.value = isGuest ? load<T[]>(name, []) : [];
      const constraints = opts.constraints ? opts.constraints() : [];
      if (!orgId || constraints === null) return;
      const sets = (Array.isArray(constraints[0]) ? constraints : [constraints]) as QueryConstraint[][];
      // One listener per filter set; each keeps its own results and the union is published.
      results = sets.map(() => []);
      stops = sets.map((set, i) =>
        onSnapshot(
          query(collection(db, "orgs", orgId, name), ...set),
          (snap) => {
            results[i] = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
            publish();
          },
          (e) => toast("error", `Could not load ${name}`, e.message)
        )
      );
    },
    { immediate: true }
  );

  function col() {
    if (!activeOrgId.value) throw new Error("No organization selected");
    return collection(db, "orgs", activeOrgId.value, name);
  }

  function failed(e: Error) {
    toast("error", `Could not save ${name}`, e.message);
  }

  /**
   * Run a Firestore write and, once it settles, drop its pending overlay.
   * Guests just write the array through to localStorage.
   */
  function commit(remote: () => Promise<unknown>, settle: () => void) {
    remote()
      .catch(failed)
      .finally(() => {
        settle();
        publish();
      });
  }

  return {
    items,
    newId: () => (guest() ? localId() : doc(col()).id),
    set(item) {
      const { id, ...data } = item;
      const i = items.value.findIndex((x) => x.id === id);
      if (i >= 0) items.value[i] = item;
      else items.value.push(item);
      if (guest()) return save(name, items.value);
      pendingRemoves.delete(id);
      pendingSets.set(id, item);
      commit(
        () => setDoc(doc(col(), id), data),
        () => {
          if (pendingSets.get(id) === item) pendingSets.delete(id);
        }
      );
    },
    update(id, patch) {
      const item = items.value.find((x) => x.id === id);
      if (item) Object.assign(item, patch);
      if (guest()) return save(name, items.value);
      // Keep a pending set in step, and overlay the patch until this write settles.
      const queued = pendingSets.get(id);
      if (queued && queued !== item) Object.assign(queued, patch);
      const entry = pendingPatches.get(id);
      pendingPatches.set(id, { patch: { ...(entry?.patch ?? {}), ...patch }, writes: (entry?.writes ?? 0) + 1 });
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) data[k] = v === undefined ? deleteField() : v;
      commit(
        () => updateDoc(doc(col(), id), data),
        () => {
          const e = pendingPatches.get(id);
          if (!e) return;
          if (e.writes <= 1) pendingPatches.delete(id);
          else e.writes--;
        }
      );
    },
    remove(id) {
      items.value = items.value.filter((x) => x.id !== id);
      if (guest()) return save(name, items.value);
      pendingSets.delete(id);
      pendingPatches.delete(id);
      pendingRemoves.add(id);
      commit(
        () => deleteDoc(doc(col(), id)),
        () => pendingRemoves.delete(id)
      );
    },
  };
}
