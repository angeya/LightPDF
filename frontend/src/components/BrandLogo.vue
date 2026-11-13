<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 20 })
</script>

<template>
  <img
    class="brand-logo"
    src="/lightpdf-logo.svg"
    :style="{ width: `${size}px`, height: `${size}px` }"
    alt="LightPDF"
    draggable="false"
  />
</template>

<style scoped>
.brand-logo {
  display: block;
  flex: none;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
