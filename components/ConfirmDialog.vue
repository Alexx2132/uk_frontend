<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Подтвердите действие' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Подтвердить' },
  cancelLabel: { type: String, default: 'Отмена' },
  tone: { type: String, default: 'primary' },
  busy: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true }
})

const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <Transition name="modal-soft">
    <div v-if="open" class="modal-backdrop modal-backdrop--stacked" @click.self="emit('close')">
      <div class="modal confirm-modal" :class="`confirm-modal--${tone}`">
        <div class="confirm-modal__topline" />
        <div class="modal__head confirm-modal__head">
          <div class="confirm-modal__title-wrap">
            <div class="confirm-modal__icon">{{ tone === 'danger' ? '!' : '?' }}</div>
            <div>
              <div class="eyebrow">Подтверждение</div>
              <h3>{{ title }}</h3>
            </div>
          </div>
          <button v-if="showClose" class="icon-btn ticket-detail-close" type="button" :disabled="busy" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>

        <div v-if="message" class="confirm-modal__message">{{ message }}</div>
        <slot />

        <div class="toolbar confirm-modal__actions">
          <button :class="['btn', tone === 'danger' ? 'btn--danger' : 'btn--primary']" type="button" :disabled="busy" @click="emit('confirm')">
            {{ busy ? 'Сохраняем...' : confirmLabel }}
          </button>
          <button class="btn btn--ghost" type="button" :disabled="busy" @click="emit('close')">{{ cancelLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
