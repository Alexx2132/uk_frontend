<script setup>
import { CONTACT_PHONE_MAX_LENGTH, formatContactPhoneInput } from '~/utils/phone'

const props = defineProps({
  open: { type: Boolean, default: false },
  apartment: { type: Object, default: null },
  residents: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'create-resident'])

const form = reactive({ full_name: '', phone: '', contact_phone: '+7', password: '' })

const residentLogin = (resident) => resident.login || resident.phone || resident.username || '—'
const residentContactPhone = (resident) => resident.contact_phone || (resident.phone && resident.phone !== resident.login ? resident.phone : '') || '—'

watch(() => props.open, (value) => {
  if (value) {
    form.full_name = ''
    form.phone = ''
    form.contact_phone = '+7'
    form.password = ''
  }
})

const submit = () => emit('create-resident', { ...form })

const onContactPhoneInput = () => {
  form.contact_phone = formatContactPhoneInput(form.contact_phone)
}
</script>

<template>
  <transition name="fade">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal">
        <div class="modal__head">
          <div>
            <h3>Квартира {{ apartment?.apartmentNumber }}</h3>
            <p class="muted">Подъезд {{ apartment?.entrance }}, этаж {{ apartment?.floor }}</p>
          </div>
          <button class="icon-btn" @click="emit('close')">✕</button>
        </div>

        <div class="modal__section">
          <div class="section-title">Жители</div>
          <div v-if="!residents.length" class="empty-box">Пока нет привязанных жильцов.</div>
          <div v-else class="resident-list">
            <div v-for="resident in residents" :key="resident.id" class="resident-card">
              <div class="resident-card__name">{{ resident.full_name || resident.login || resident.username || 'Без имени' }}</div>
              <div class="resident-card__meta">Логин: {{ residentLogin(resident) }} · Телефон: {{ residentContactPhone(resident) }}</div>
            </div>
          </div>
        </div>

        <div class="modal__section">
          <div class="section-title">Добавить жильца</div>
          <div class="form-grid">
            <label class="field"><span>ФИО</span><input v-model="form.full_name" type="text" /></label>
            <label class="field"><span>Логин</span><input v-model="form.phone" type="text" /></label>
            <label class="field"><span>Пароль</span><input v-model="form.password" type="text" /></label>
            <label class="field"><span>Контактный телефон</span><input v-model="form.contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" @input="onContactPhoneInput" /></label>
          </div>
          <button class="btn btn--primary" @click="submit">Создать жильца</button>
        </div>
      </div>
    </div>
  </transition>
</template>
