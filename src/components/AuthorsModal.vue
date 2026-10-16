<script setup lang="ts">
import Modal from "./Modal.vue";
import AuthorsPanel from "./AuthorsPanel.vue";
import { authorsDialog, closeAuthors } from "../stores/authors";
</script>

<template>
  <Modal title="Authors" @close="closeAuthors">
    <AuthorsPanel :prefill="authorsDialog?.prefill" />
  </Modal>
</template>
