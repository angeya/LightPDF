<script setup lang="ts">
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
</script>

<template>
  <div class="toast-stack">
    <div v-for="item in ui.toasts" :key="item.id" class="toast" :class="`is-${item.type}`">
      {{ item.message }}
    </div>
  </div>
</template>
