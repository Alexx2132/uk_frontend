<script setup>
const { toasts, removeToast } = useToast()

const openToastTarget = async (toast) => {
  if (!toast?.actionTo) return
  await navigateTo(toast.actionTo)
  removeToast(toast.id)
}
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <TransitionGroup name="toast" tag="div" class="toast-host__stack">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card"
        :class="[
          `toast-card--${toast.type || 'success'}`,
          { 'toast-card--clickable': toast.actionTo, 'toast-card--persistent': toast.persistent }
        ]"
        @click="openToastTarget(toast)"
      >
        <button class="toast-card__close" type="button" @click.stop="removeToast(toast.id)" aria-label="Закрыть уведомление">
          ×
        </button>
        <div class="toast-card__message">{{ toast.message }}</div>
        <div v-if="toast.actionTo" class="toast-card__action">
          {{ toast.actionLabel || 'Открыть' }}
        </div>
        <div v-if="!toast.persistent" class="toast-card__progress">
          <span :style="{ animationDuration: `${toast.duration}ms` }" />
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
