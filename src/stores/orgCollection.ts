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

  watch(
    [activeOrgId, guest, () => opts.constraintsKey?.() ?? ""],
    ([orgId, isGuest]) => {
      stops.forEach((f) => f());
      stops = [];
      items.value = isGuest ? load<T[]>(name, []) : [];
      const constraints = opts.constraints ? opts.constraints() : [];
      if (!orgId || constraints === null) return;
      const sets = (Array.isArray(constraints[0]) ? constraints : [constraints]) as QueryConstraint[][];
      // One listener per filter set; each keeps its own results and the union is published.
      const results: T[][] = sets.map(() => []);
      const publish = () => {
        const byId = new Map<string, T>();
        for (const list of results) for (const item of list) byId.set(item.id, item);
        items.value = [...byId.values()];
      };
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

  /** For guests, write the array through to localStorage; otherwise run the Firestore write. */
  function commit(remote: () => Promise<unknown>) {
    if (guest()) save(name, items.value);
    else remote().catch(failed);
  }

  return {
    items,
    newId: () => (guest() ? localId() : doc(col()).id),
    set(item) {
      const { id, ...data } = item;
      const i = items.value.findIndex((x) => x.id === id);
      if (i >= 0) items.value[i] = item;
      else items.value.push(item);
      commit(() => setDoc(doc(col(), id), data));
    },
    update(id, patch) {
      const item = items.value.find((x) => x.id === id);
      if (item) Object.assign(item, patch);
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) data[k] = v === undefined ? deleteField() : v;
      commit(() => updateDoc(doc(col(), id), data));
    },
    remove(id) {
      items.value = items.value.filter((x) => x.id !== id);
      commit(() => deleteDoc(doc(col(), id)));
    },
  };
}
