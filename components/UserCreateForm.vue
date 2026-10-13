<script setup>
import { formatSpecialty } from '~/utils/format'
import { CONTACT_PHONE_MAX_LENGTH, formatContactPhoneInput, validateContactPhone } from '~/utils/phone'

const props = defineProps({
  houses: { type: Array, default: () => [] },
  specialties: { type: Array, default: () => [] },
  message: { type: String, default: '' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['submit', 'cancel'])

const dispatcherPriorityOptions = [
  { value: 'low', label: 'Низкий' },
  { value: 'normal', label: 'Обычный' },
  { value: 'high', label: 'Высокий' },
  { value: 'emergency', label: 'Аварийный' }
]
const defaultDispatcherPriorities = () => dispatcherPriorityOptions.map((item) => item.value)
const hasCyrillic = (value) => /[А-Яа-яЁё]/.test(String(value || ''))
const hasWhitespace = (value) => /\s/.test(String(value || ''))

const form = reactive({
  full_name: '',
  phone: '',
  contact_phone: '+7',
  password: '',
  role: 'resident',
  specialty_ids: [],
  primary_specialty_id: '',
  house_id: null,
  apartment: '',
  can_manage_houses: false,
  can_ban_residents: false,
  can_create_users: false,
  can_manage_executor_schedules: false,
  can_manage_service_settings: false,
  can_manage_remarks: false,
  can_manage_house_info: false,
  can_manage_announcements: false,
  can_manage_password_recovery: false,
  can_approve_registrations: false,
  allowed_ticket_priorities: defaultDispatcherPriorities()
})

const dispatcherPermissionsOpen = ref(false)
const assistantPermissionsOpen = ref(true)
const localError = ref('')

watch(form, () => {
  if (localError.value) localError.value = ''
}, { deep: true })

const specialtyOptions = computed(() => props.specialties.map((item) => ({
  value: String(item.id),
  label: formatSpecialty(item.name || item.code)
})))

const roleOptions = [
  { value: 'admin_assistant', label: 'Помощник администратора' },
  { value: 'dispatcher', label: 'Диспетчер' },
  { value: 'executor', label: 'Исполнитель' },
  { value: 'auditor', label: 'Аудитор' },
  { value: 'resident', label: 'Житель' }
]

const ensureExecutorSpecialtyDefaults = () => {
  if (form.role !== 'executor' || form.specialty_ids.length || !specialtyOptions.value.length) return
  const first = specialtyOptions.value[0].value
  form.specialty_ids = [first]
  form.primary_specialty_id = first
}

const toggleSpecialty = (specialtyId) => {
  const id = String(specialtyId)
  const current = new Set(form.specialty_ids || [])
  if (current.has(id)) current.delete(id)
  else current.add(id)
  form.specialty_ids = Array.from(current)
  if (!form.specialty_ids.includes(String(form.primary_specialty_id))) {
    form.primary_specialty_id = form.specialty_ids[0] || ''
  }
}

const reset = () => {
  form.full_name = ''
  form.phone = ''
  form.contact_phone = '+7'
  form.password = ''
  form.role = 'resident'
  form.specialty_ids = []
  form.primary_specialty_id = ''
  form.house_id = null
  form.apartment = ''
  form.can_manage_houses = false
  form.can_ban_residents = false
  form.can_create_users = false
  form.can_manage_executor_schedules = false
  form.can_manage_service_settings = false
  form.can_manage_remarks = false
  form.can_manage_house_info = false
  form.can_manage_announcements = false
  form.can_manage_password_recovery = false
  form.can_approve_registrations = false
  form.allowed_ticket_priorities = defaultDispatcherPriorities()
  dispatcherPermissionsOpen.value = false
  assistantPermissionsOpen.value = true
}

const onContactPhoneInput = () => {
  form.contact_phone = formatContactPhoneInput(form.contact_phone)
}

watch(() => form.role, (value) => {
  if (!['dispatcher', 'admin_assistant'].includes(value)) {
    form.can_manage_houses = false
    form.can_ban_residents = false
  }
  if (value !== 'dispatcher') {
    dispatcherPermissionsOpen.value = false
    form.allowed_ticket_priorities = defaultDispatcherPriorities()
  }
  if (value !== 'admin_assistant') {
    form.can_create_users = false
    form.can_manage_executor_schedules = false
    form.can_manage_service_settings = false
    form.can_manage_remarks = false
    form.can_manage_house_info = false
    form.can_manage_announcements = false
    form.can_manage_password_recovery = false
    form.can_approve_registrations = false
    assistantPermissionsOpen.value = true
  }
  if (!['resident', 'executor'].includes(value)) {
    form.house_id = null
  }
  if (value !== 'resident') {
    form.apartment = ''
  }
  if (value === 'executor') {
    ensureExecutorSpecialtyDefaults()
  } else {
    form.specialty_ids = []
    form.primary_specialty_id = ''
  }
})

watch(() => props.specialties, ensureExecutorSpecialtyDefaults, { deep: true, immediate: true })

const validate = () => {
  if (!form.full_name.trim()) return 'Введите имя пользователя'
  if (!form.phone.trim()) return 'Введите логин'
  if (hasWhitespace(form.phone)) return 'Логин не должен содержать пробелы'
  if (hasCyrillic(form.phone)) return 'Логин должен быть указан латинскими символами, цифрами или знаками'
  if (!form.password.trim()) return 'Введите пароль'
  if (form.password.trim().length < 3) return 'Пароль должен содержать не менее 3 символов'
  if (hasCyrillic(form.password)) return 'Пароль не должен содержать русские буквы'
  const phoneValidation = validateContactPhone(form.contact_phone, { required: form.role === 'resident' })
  if (!phoneValidation.ok) return phoneValidation.error
  if (!form.role) return 'Выберите роль'
  if (form.role === 'executor' && !form.specialty_ids.length) return 'Выберите хотя бы одну специализацию исполнителя'
  if (form.role === 'executor' && form.specialty_ids.length && !form.primary_specialty_id) return 'Выберите основную специализацию исполнителя'
  if (form.role === 'resident' && !form.house_id) return 'Выберите дом жителя'
  if (form.role === 'resident' && !String(form.apartment || '').trim()) return 'Укажите квартиру жителя'
  if (form.role === 'dispatcher' && !form.allowed_ticket_priorities.length) return 'Выберите хотя бы один приоритет заявок для диспетчера'
  return ''
}

const submit = () => {
  localError.value = validate()
  if (localError.value) return
  emit('submit', { ...form })
}

defineExpose({ reset })
</script>

<template>
  <div class="panel user-create-panel">
    <div class="form-grid">
      <label class="field">
        <span>Имя</span>
        <input v-model="form.full_name" type="text" />
      </label>

      <label class="field">
        <span>Логин</span>
        <input v-model="form.phone" type="text" />
      </label>

      <label class="field">
        <span>Пароль</span>
        <input v-model="form.password" type="password" />
      </label>

      <label class="field">
        <span>Роль</span>
        <select v-model="form.role">
          <option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>

      <label class="field">
        <span>Контактный телефон</span>
        <input v-model="form.contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" @input="onContactPhoneInput" />
      </label>

      <label v-if="form.role === 'executor'" class="field">
        <span>Закреплённый дом</span>
        <select v-model="form.house_id">
          <option :value="null">Без привязки, любой дом</option>
          <option v-for="house in props.houses" :key="house.id" :value="house.id">{{ house.city }}, {{ house.address }}</option>
        </select>
      </label>

      <label v-if="form.role === 'resident'" class="field">
        <span>Дом</span>
        <select v-model="form.house_id">
          <option :value="null">Не выбран</option>
          <option v-for="house in props.houses" :key="house.id" :value="house.id">{{ house.city }}, {{ house.address }}</option>
        </select>
      </label>

      <label v-if="form.role === 'resident'" class="field">
        <span>Квартира</span>
        <input v-model="form.apartment" type="text" />
      </label>
    </div>

    <div v-if="form.role === 'executor'" class="collapsible-shell executor-admin-settings">
      <section class="executor-admin-settings__section">
        <div class="section-title">Специализации исполнителя</div>
        <div v-if="specialtyOptions.length" class="executor-specialty-grid">
          <label
            v-for="item in specialtyOptions"
            :key="item.value"
            class="executor-specialty-option"
            :class="{ 'executor-specialty-option--active': form.specialty_ids.includes(item.value) }"
          >
            <input
              :checked="form.specialty_ids.includes(item.value)"
              type="checkbox"
              @change="toggleSpecialty(item.value)"
            />
            <span>{{ item.label }}</span>
          </label>
        </div>
        <div v-else class="empty-box">Справочник специализаций пока пуст. Исполнителя можно создать без специализаций и настроить позже.</div>
        <label v-if="form.specialty_ids.length" class="field">
          <span>Основная специализация</span>
          <select v-model="form.primary_specialty_id">
            <option v-for="id in form.specialty_ids" :key="id" :value="id">{{ specialtyOptions.find((item) => item.value === id)?.label || 'Специализация' }}</option>
          </select>
        </label>
      </section>
    </div>

    <div v-if="form.role === 'dispatcher'" class="collapsible-shell">
      <button class="collapsible-toggle" type="button" @click="dispatcherPermissionsOpen = !dispatcherPermissionsOpen">
        <span>Полномочия диспетчера</span>
        <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': dispatcherPermissionsOpen }" aria-hidden="true"></span>
      </button>
      <div v-if="dispatcherPermissionsOpen" class="dispatcher-permissions">
        <label class="checkbox">
          <input v-model="form.can_manage_houses" type="checkbox" />
          <span>Может создавать и редактировать дома</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_ban_residents" type="checkbox" />
          <span>Может блокировать жильцов для создания заявок</span>
        </label>
        <div class="dispatcher-priority-permissions">
          <div>
            <strong>Видимые приоритеты заявок</strong>
            <p>По умолчанию диспетчер получает заявки со всеми приоритетами.</p>
          </div>
          <label
            v-for="item in dispatcherPriorityOptions"
            :key="item.value"
            class="checkbox dispatcher-priority-permissions__item"
          >
            <input v-model="form.allowed_ticket_priorities" type="checkbox" :value="item.value" />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="form.role === 'admin_assistant'" class="collapsible-shell assistant-permissions-shell">
      <button class="collapsible-toggle" type="button" @click="assistantPermissionsOpen = !assistantPermissionsOpen">
        <span>Полномочия помощника администратора</span>
        <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': assistantPermissionsOpen }" aria-hidden="true"></span>
      </button>
      <div v-if="assistantPermissionsOpen" class="dispatcher-permissions assistant-permissions">
        <div class="muted-box">
          Помощник администратора не является вторым администратором. Выберите только те действия, которые ему действительно нужны.
        </div>
        <label class="checkbox">
          <input v-model="form.can_manage_houses" type="checkbox" />
          <span>Добавление и редактирование домов</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_create_users" type="checkbox" />
          <span>Добавление пользователей</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_executor_schedules" type="checkbox" />
          <span>Редактирование графиков, специализаций и привязки исполнителей</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_ban_residents" type="checkbox" />
          <span>Блокировка и разблокировка жителей</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_service_settings" type="checkbox" />
          <span>Редактирование данных сервиса, заголовков и категорий</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_remarks" type="checkbox" />
          <span>Вынесение и отмена замечаний</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_house_info" type="checkbox" />
          <span>Добавление информации по дому, контактов, работ и графиков</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_announcements" type="checkbox" />
          <span>Создание и архивирование своих объявлений</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_manage_password_recovery" type="checkbox" />
          <span>Восстановление доступа</span>
        </label>
        <label class="checkbox">
          <input v-model="form.can_approve_registrations" type="checkbox" />
          <span>Подтверждение заявок на регистрацию жителей</span>
        </label>
      </div>
    </div>

    <div v-if="localError || error" class="alert alert--error">{{ localError || error }}</div>

    <button class="btn btn--primary" type="button" @click="submit">Добавить пользователя</button>
  </div>
</template>
