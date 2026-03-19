<script setup lang="ts">
import { useWindowControls } from "../../composables/useWindowControls";

const { isDraggingOpacity, opacity, startOpacityDrag } = useWindowControls();

function onMouseDown(e: MouseEvent) {
  e.preventDefault();
  startOpacityDrag(e.clientY);
}
</script>

<template>
  <div
    class="opacity-handle"
    :class="{ dragging: isDraggingOpacity }"
    @mousedown="onMouseDown"
    :title="`透明度: ${opacity}%`"
  >
    <div class="handle-track">
      <div class="handle-fill" :style="{ height: `${opacity}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.opacity-handle {
  position: absolute;
  right: 0;
  top: var(--titlebar-height);
  bottom: 0;
  width: 8px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
}

.opacity-handle:hover,
.opacity-handle.dragging {
  opacity: 1;
}

.handle-track {
  width: 3px;
  height: 80%;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
}

.handle-fill {
  width: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: height 0.1s;
}
</style>
