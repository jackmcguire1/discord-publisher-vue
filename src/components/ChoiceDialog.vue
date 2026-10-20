<script setup lang="ts">
import Modal from "./Modal.vue";
import { pendingQuestion, answer } from "../stores/dialog";
</script>

<template>
  <Modal v-if="pendingQuestion" :title="pendingQuestion.title" @close="answer(null)">
    <p class="choice-message" style="margin: 0; white-space: pre-line">{{ pendingQuestion.message }}</p>
    <template #footer>
      <button
        v-for="c in pendingQuestion.choices"
        :key="c.id"
        class="btn choice-button"
        :class="c.kind === 'danger' ? 'btn-danger' : c.kind === 'primary' ? 'btn-primary' : 'btn-ghost'"
        :data-choice="c.id"
        @click="answer(c.id)"
      >
        {{ c.label }}
      </button>
    </template>
  </Modal>
</template>
