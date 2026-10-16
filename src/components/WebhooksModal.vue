<script setup lang="ts">
import Modal from "./Modal.vue";
import WebhooksPanel from "./WebhooksPanel.vue";

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Modal title="Webhooks and servers" @close="emit('close')">
    <WebhooksPanel @used="emit('close')" />
  </Modal>
</template>
