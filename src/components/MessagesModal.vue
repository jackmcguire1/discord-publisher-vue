<script setup lang="ts">
import Modal from "./Modal.vue";
import MessagesPanel from "./MessagesPanel.vue";

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Modal title="Messages" @close="emit('close')">
    <MessagesPanel @loaded="emit('close')" @handoff="emit('close')" />
  </Modal>
</template>
