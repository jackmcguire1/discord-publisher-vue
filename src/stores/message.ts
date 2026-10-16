import { ref, computed, watch } from "vue";
import {
  defaultMessage,
  emptyEmbed,
  emptyField,
  validateMessage,
  type Message,
  type Embed,
} from "../discord/schema";
import { load, save } from "./persist";

// The message currently being edited. One global instance is enough for a
// single-page editor, so this is a plain module store rather than Pinia.

interface Persisted {
  message: Message;
  draftId: string | null;
  /** The message as last loaded, saved or published, to tell whether there are unsaved changes. */
  clean?: string;
}

const persisted = load<Persisted | null>("current", null);
export const message = ref<Message>(persisted?.message ?? defaultMessage());
/** Which saved draft this message was loaded from, if any. */
export const currentDraftId = ref<string | null>(persisted?.draftId ?? null);

const cleanSnapshot = ref(persisted?.clean ?? JSON.stringify(message.value));
/** True when the editor has changes that aren't saved in a draft or published. */
export const isDirty = computed(() => JSON.stringify(message.value) !== cleanSnapshot.value);
/** Call after the current message has been saved or published. */
export function markClean() {
  cleanSnapshot.value = JSON.stringify(message.value);
}

/** Treat `saved` as the last saved state, so the editor's differences from it show as unsaved changes. */
export function markCleanAs(saved: Message) {
  cleanSnapshot.value = JSON.stringify(saved);
}

watch(
  [message, currentDraftId, cleanSnapshot],
  () => save("current", { message: message.value, draftId: currentDraftId.value, clean: cleanSnapshot.value }),
  { deep: true }
);

// --- validation (debounced so typing stays smooth) -------------------------

export const errors = ref(validateMessage(message.value));
let validateTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  message,
  (m) => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => (errors.value = validateMessage(m)), 200);
  },
  { deep: true }
);
export const isValid = computed(() => Object.keys(errors.value).length === 0);

// A message just started with "New message" is empty and therefore invalid;
// shouting about that before anyone has typed is noise. Errors stay hidden
// until the message is first changed (publishing stays blocked regardless).
const untouchedNew = ref<string | null>(null);
watch(
  message,
  (m) => {
    if (untouchedNew.value !== null && JSON.stringify(m) !== untouchedNew.value) untouchedNew.value = null;
  },
  { deep: true }
);
/** Call right after starting a blank message. */
export function markUntouched() {
  untouchedNew.value = JSON.stringify(message.value);
}
/** Whether validation errors should be shown (false until a new message is first edited). */
export const showErrors = computed(() => untouchedNew.value === null);

export function errorAt(path: string): string | undefined {
  return showErrors.value ? errors.value[path] : undefined;
}

// --- undo / redo -------------------------------------------------------------

const HISTORY_LIMIT = 100;
const past: string[] = [];
const future: string[] = [];
let lastSnapshot = JSON.stringify(message.value);
let historyTimer: ReturnType<typeof setTimeout> | undefined;
let restoring = false;

export const canUndo = ref(false);
export const canRedo = ref(false);
function syncHistoryFlags() {
  canUndo.value = past.length > 0;
  canRedo.value = future.length > 0;
}

watch(
  message,
  (m) => {
    if (restoring) return;
    clearTimeout(historyTimer);
    // Group rapid keystrokes into one undo step.
    historyTimer = setTimeout(() => {
      const snap = JSON.stringify(m);
      if (snap === lastSnapshot) return;
      past.push(lastSnapshot);
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
      lastSnapshot = snap;
      syncHistoryFlags();
    }, 400);
  },
  { deep: true }
);

function restore(snap: string) {
  restoring = true;
  clearTimeout(historyTimer);
  message.value = JSON.parse(snap);
  lastSnapshot = snap;
  syncHistoryFlags();
  // Let the deep watcher fire (and be ignored) before re-enabling history.
  queueMicrotask(() => (restoring = false));
}

export function undo() {
  const snap = past.pop();
  if (snap === undefined) return;
  future.push(lastSnapshot);
  restore(snap);
}

export function redo() {
  const snap = future.pop();
  if (snap === undefined) return;
  past.push(lastSnapshot);
  restore(snap);
}

// --- mutations ---------------------------------------------------------------

/** Replace the whole message (import, load draft, clear). */
export function replaceMessage(
  next: Message,
  draftId: string | null = null,
  /** `edit`: the new content is a change to the current message (e.g. applied JSON), so it shows as unsaved. */
  opts: { edit?: boolean } = {}
) {
  untouchedNew.value = null;
  message.value = next;
  currentDraftId.value = draftId;
  errors.value = validateMessage(next);
  if (!opts.edit) markClean();
}

export function addEmbed() {
  if (message.value.embeds.length >= 10) return;
  message.value.embeds.push(emptyEmbed());
}

export function duplicateEmbed(i: number) {
  if (message.value.embeds.length >= 10) return;
  const copy: Embed = JSON.parse(JSON.stringify(message.value.embeds[i]));
  copy.id = emptyEmbed().id;
  copy.fields.forEach((f) => (f.id = emptyField().id));
  message.value.embeds.splice(i + 1, 0, copy);
}

export function removeEmbed(i: number) {
  message.value.embeds.splice(i, 1);
}

export function moveEmbed(i: number, dir: -1 | 1) {
  const arr = message.value.embeds;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function addField(embedIndex: number) {
  const embed = message.value.embeds[embedIndex];
  if (embed.fields.length >= 25) return;
  embed.fields.push(emptyField());
}

export function duplicateField(embedIndex: number, i: number) {
  const embed = message.value.embeds[embedIndex];
  if (embed.fields.length >= 25) return;
  embed.fields.splice(i + 1, 0, { ...embed.fields[i], id: emptyField().id });
}

export function removeField(embedIndex: number, i: number) {
  message.value.embeds[embedIndex].fields.splice(i, 1);
}

export function moveField(embedIndex: number, i: number, dir: -1 | 1) {
  const arr = message.value.embeds[embedIndex].fields;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
