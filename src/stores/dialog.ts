import { ref } from "vue";

// A modal question with several answers (beyond confirm()'s OK/Cancel).
// `ask()` resolves with the chosen choice id, or null if dismissed.

export interface Choice {
  id: string;
  label: string;
  kind?: "primary" | "danger" | "ghost";
}

interface Pending {
  title: string;
  message: string;
  choices: Choice[];
  resolve: (id: string | null) => void;
}

export const pendingQuestion = ref<Pending | null>(null);

export function ask(title: string, message: string, choices: Choice[]): Promise<string | null> {
  pendingQuestion.value?.resolve(null);
  return new Promise((resolve) => {
    pendingQuestion.value = { title, message, choices, resolve };
  });
}

export function answer(id: string | null) {
  const q = pendingQuestion.value;
  pendingQuestion.value = null;
  q?.resolve(id);
}
