import { ref, watch, type Ref } from "vue";
import { collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { activeOrgId } from "./session";
import { toast } from "./toasts";

// A Firestore subcollection of the active org (orgs/{orgId}/{name}) mirrored
// into a reactive array. Writes update the array straight away so callers can
// keep treating stores as synchronous; the snapshot listener then confirms them.

export interface OrgCollection<T extends { id: string }> {
  items: Ref<T[]>;
  /** A fresh document id in this collection. */
  newId(): string;
  set(item: T): void;
  /** Patch fields; `undefined` values delete the field. */
  update(id: string, patch: Partial<Omit<T, "id">>): void;
  remove(id: string): void;
}

export function orgCollection<T extends { id: string }>(name: string): OrgCollection<T> {
  const items = ref<T[]>([]) as Ref<T[]>;
  let stop: (() => void) | null = null;

  watch(
    activeOrgId,
    (orgId) => {
      stop?.();
      stop = null;
      items.value = [];
      if (!orgId) return;
      stop = onSnapshot(
        collection(db, "orgs", orgId, name),
        (snap) => (items.value = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
        (e) => toast("error", `Could not load ${name}`, e.message)
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

  return {
    items,
    newId: () => doc(col()).id,
    set(item) {
      const { id, ...data } = item;
      const i = items.value.findIndex((x) => x.id === id);
      if (i >= 0) items.value[i] = item;
      else items.value.push(item);
      setDoc(doc(col(), id), data).catch(failed);
    },
    update(id, patch) {
      const item = items.value.find((x) => x.id === id);
      if (item) Object.assign(item, patch);
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) data[k] = v === undefined ? deleteField() : v;
      updateDoc(doc(col(), id), data).catch(failed);
    },
    remove(id) {
      items.value = items.value.filter((x) => x.id !== id);
      deleteDoc(doc(col(), id)).catch(failed);
    },
  };
}
