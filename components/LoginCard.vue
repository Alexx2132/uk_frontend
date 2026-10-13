<script setup>
import { CONTACT_PHONE_MAX_LENGTH, formatContactPhoneInput, validateContactPhone } from '~/utils/phone'

const auth = useAuth()
const config = useRuntimeConfig()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const { settings, error: settingsError, loadSettings } = useAppSettings()
const recoveryOpen = ref(false)
const recoveryLoading = ref(false)
const recoveryMessage = ref('')
const recoveryError = ref('')
const registrationOpen = ref(false)
const registrationLoading = ref(false)
const registrationMessage = ref('')
const registrationError = ref('')
const recoveryForm = reactive({
  login: '',
  full_name: '',
  contact_phone: '+7',
  house_id: null,
  apartment_id: null,
  house_address: '',
  apartment: '',
  message: ''
})
const recoveryHouses = ref([])
const recoveryApartments = ref([])
const recoveryLocationLoading = ref(false)
let recoveryHouseSearchTimer = null
const registrationForm = reactive({
  login: '',
  full_name: '',
  contact_phone: '+7',
  house_id: null,
  apartment_id: null,
  house_address: '',
  apartment: '',
  message: ''
})
const registrationHouses = ref([])
const registrationApartments = ref([])
const registrationLocationLoading = ref(false)
let registrationHouseSearchTimer = null

useHead(() => ({
  title: settings.value.login_title
}))

const validateLoginForm = () => {
  const hasUsername = String(username.value || '').trim().length > 0
  const hasPassword = String(password.value || '').trim().length > 0

  if (!hasUsername && !hasPassword) return 'Введите логин и пароль'
  if (!hasUsername) return 'Введите логин'
  if (!hasPassword) return 'Введите пароль'
  return ''
}

const onSubmit = async () => {
  const validationError = validateLoginForm()
  if (validationError) {
    error.value = validationError
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    await navigateTo(auth.user.value?.must_change_password ? '/profile?password=required' : '/dashboard')
  } catch (e) {
    error.value = e?.message || e?.data?.detail || 'Не удалось войти'
  } finally {
    loading.value = false
  }
}

const recoveryHouseLabel = (house) => [house?.city, house?.address].filter(Boolean).join(', ')

const recoveryApartmentLabel = (apartment) => {
  const details = []
  if (apartment?.entrance_number) details.push(`подъезд ${apartment.entrance_number}`)
  if (apartment?.floor_number) details.push(`этаж ${apartment.floor_number}`)
  return details.length ? `${apartment.apartment_number} (${details.join(', ')})` : apartment?.apartment_number
}

const loadRecoveryHouses = async (query = '') => {
  recoveryLocationLoading.value = true
  try {
    recoveryHouses.value = await $fetch('/password-recovery/houses', {
      baseURL: config.public.apiBase,
      query: {
        query: query || undefined,
        limit: 80
      }
    })
  } catch (requestError) {
    recoveryError.value = requestError?.data?.detail || requestError?.message || 'Не удалось загрузить список домов'
  } finally {
    recoveryLocationLoading.value = false
  }
}

const loadRecoveryApartments = async (houseId) => {
  if (!houseId) return
  recoveryLocationLoading.value = true
  try {
    recoveryApartments.value = await $fetch(`/password-recovery/houses/${houseId}/apartments`, {
      baseURL: config.public.apiBase
    })
  } catch (requestError) {
    recoveryError.value = requestError?.data?.detail || requestError?.message || 'Не удалось загрузить список квартир'
  } finally {
    recoveryLocationLoading.value = false
  }
}

const onRecoveryHouseInput = () => {
  const value = recoveryForm.house_address.trim()
  const selectedHouse = recoveryHouses.value.find((house) => recoveryHouseLabel(house) === value || house.address === value)
  recoveryForm.house_id = selectedHouse?.id || null
  recoveryForm.apartment_id = null
  recoveryForm.apartment = ''
  recoveryApartments.value = []
  if (selectedHouse) {
    loadRecoveryApartments(selectedHouse.id)
    return
  }

  if (recoveryHouseSearchTimer) clearTimeout(recoveryHouseSearchTimer)
  recoveryHouseSearchTimer = setTimeout(() => {
    loadRecoveryHouses(value)
  }, 250)
}

const onRecoveryApartmentInput = () => {
  const value = recoveryForm.apartment.trim()
  const selectedApartment = recoveryApartments.value.find((apartment) => (
    recoveryApartmentLabel(apartment) === value
    || String(apartment.apartment_number) === value
  ))
  recoveryForm.apartment_id = selectedApartment?.id || null
  if (selectedApartment) recoveryForm.apartment = selectedApartment.apartment_number
}

const registrationHouseLabel = (house) => recoveryHouseLabel(house)
const registrationApartmentLabel = (apartment) => recoveryApartmentLabel(apartment)

const loadRegistrationHouses = async (query = '') => {
  registrationLocationLoading.value = true
  try {
    registrationHouses.value = await $fetch('/registration/houses', {
      baseURL: config.public.apiBase,
      query: {
        query: query || undefined,
        limit: 80
      }
    })
  } catch (requestError) {
    registrationError.value = requestError?.data?.detail || requestError?.message || 'Не удалось загрузить список домов'
  } finally {
    registrationLocationLoading.value = false
  }
}

const loadRegistrationApartments = async (houseId) => {
  if (!houseId) return
  registrationLocationLoading.value = true
  try {
    registrationApartments.value = await $fetch(`/registration/houses/${houseId}/apartments`, {
      baseURL: config.public.apiBase
    })
  } catch (requestError) {
    registrationError.value = requestError?.data?.detail || requestError?.message || 'Не удалось загрузить список квартир'
  } finally {
    registrationLocationLoading.value = false
  }
}

const onRegistrationHouseInput = () => {
  const value = registrationForm.house_address.trim()
  const selectedHouse = registrationHouses.value.find((house) => registrationHouseLabel(house) === value || house.address === value)
  registrationForm.house_id = selectedHouse?.id || null
  registrationForm.apartment_id = null
  registrationForm.apartment = ''
  registrationApartments.value = []
  if (selectedHouse) {
    loadRegistrationApartments(selectedHouse.id)
    return
  }

  if (registrationHouseSearchTimer) clearTimeout(registrationHouseSearchTimer)
  registrationHouseSearchTimer = setTimeout(() => {
    loadRegistrationHouses(value)
  }, 250)
}

const onRegistrationApartmentInput = () => {
  const value = registrationForm.apartment.trim()
  const selectedApartment = registrationApartments.value.find((apartment) => (
    registrationApartmentLabel(apartment) === value
    || String(apartment.apartment_number) === value
  ))
  registrationForm.apartment_id = selectedApartment?.id || null
  if (selectedApartment) registrationForm.apartment = selectedApartment.apartment_number
}

const openRecovery = () => {
  recoveryForm.login = String(username.value || '').trim()
  recoveryForm.full_name = ''
  recoveryForm.contact_phone = '+7'
  recoveryForm.house_id = null
  recoveryForm.apartment_id = null
  recoveryForm.house_address = ''
  recoveryForm.apartment = ''
  recoveryForm.message = ''
  recoveryHouses.value = []
  recoveryApartments.value = []
  recoveryMessage.value = ''
  recoveryError.value = ''
  recoveryOpen.value = true
  loadRecoveryHouses()
}

const closeRecovery = () => {
  recoveryOpen.value = false
}

const openRegistration = () => {
  registrationForm.login = ''
  registrationForm.full_name = ''
  registrationForm.contact_phone = '+7'
  registrationForm.house_id = null
  registrationForm.apartment_id = null
  registrationForm.house_address = ''
  registrationForm.apartment = ''
  registrationForm.message = ''
  registrationHouses.value = []
  registrationApartments.value = []
  registrationMessage.value = ''
  registrationError.value = ''
  registrationOpen.value = true
  loadRegistrationHouses()
}

const closeRegistration = () => {
  registrationOpen.value = false
}

const onRecoveryContactPhoneInput = () => {
  recoveryForm.contact_phone = formatContactPhoneInput(recoveryForm.contact_phone)
}

const onRegistrationContactPhoneInput = () => {
  registrationForm.contact_phone = formatContactPhoneInput(registrationForm.contact_phone)
}

const submitRecovery = async () => {
  recoveryError.value = ''
  recoveryMessage.value = ''

  const login = recoveryForm.login.trim()
  if (!login) {
    recoveryError.value = 'Введите логин'
    return
  }
  const phoneValidation = validateContactPhone(recoveryForm.contact_phone, { required: true })
  if (!phoneValidation.ok) {
    recoveryError.value = phoneValidation.error
    return
  }
  const contactPhone = phoneValidation.value

  recoveryLoading.value = true
  try {
    await $fetch('/password-recovery/requests', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: {
        login,
        full_name: recoveryForm.full_name.trim() || null,
        contact_phone: contactPhone,
        house_id: recoveryForm.house_id || null,
        apartment_id: recoveryForm.apartment_id || null,
        house_address: recoveryForm.house_address.trim() || null,
        apartment: recoveryForm.apartment.trim() || null,
        message: recoveryForm.message.trim() || null
      }
    })
    recoveryMessage.value = 'Запрос отправлен. Администратор проверит данные и сообщит временный пароль.'
  } catch (requestError) {
    recoveryError.value = requestError?.data?.detail || requestError?.message || 'Не удалось отправить запрос'
  } finally {
    recoveryLoading.value = false
  }
}

const submitRegistration = async () => {
  registrationError.value = ''
  registrationMessage.value = ''

  const login = registrationForm.login.trim()
  const fullName = registrationForm.full_name.trim()
  if (!login) {
    registrationError.value = 'Введите логин'
    return
  }
  if (!fullName) {
    registrationError.value = 'Введите имя'
    return
  }
  const phoneValidation = validateContactPhone(registrationForm.contact_phone, { required: true })
  if (!phoneValidation.ok) {
    registrationError.value = phoneValidation.error
    return
  }
  const contactPhone = phoneValidation.value
  if (!registrationForm.house_id) {
    registrationError.value = 'Выберите дом из списка'
    return
  }
  if (!registrationForm.apartment_id) {
    registrationError.value = 'Выберите квартиру из списка'
    return
  }

  registrationLoading.value = true
  try {
    await $fetch('/registration/requests', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: {
        login,
        full_name: fullName,
        contact_phone: contactPhone,
        house_id: Number(registrationForm.house_id),
        apartment_id: Number(registrationForm.apartment_id),
        message: registrationForm.message.trim() || null
      }
    })
    registrationMessage.value = 'Заявка отправлена. Администратор проверит данные и создаст учетную запись.'
  } catch (requestError) {
    registrationError.value = requestError?.data?.detail || requestError?.message || 'Не удалось отправить заявку'
  } finally {
    registrationLoading.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="login-card">
    <div class="eyebrow">{{ settings.app_brand }}</div>
    <h1>{{ settings.login_title }}</h1>
    <form class="stack" @submit.prevent="onSubmit">
      <label class="field">
        <span>Логин</span>
        <input v-model="username" type="text" placeholder="Введите логин" />
      </label>
      <label class="field">
        <span>Пароль</span>
        <div class="login-password-control">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Введите пароль" />
          <button
            type="button"
            class="login-password-control__toggle"
            :aria-label="showPassword ? 'Скрыть пароль' : 'Показать пароль'"
            :title="showPassword ? 'Скрыть пароль' : 'Показать пароль'"
            @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5.5c5.1 0 8.5 4.1 9.6 5.7.3.5.3 1.1 0 1.6-1.1 1.6-4.5 5.7-9.6 5.7s-8.5-4.1-9.6-5.7a1.45 1.45 0 0 1 0-1.6C3.5 9.6 6.9 5.5 12 5.5Zm0 2C7.9 7.5 5 10.7 4.2 12c.8 1.3 3.7 4.5 7.8 4.5s7-3.2 7.8-4.5C19 10.7 16.1 7.5 12 7.5Zm0 1.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4.1 3 16.9 16.9-1.3 1.3-3.1-3.1a10.5 10.5 0 0 1-4.6 1.1c-5.1 0-8.5-4.1-9.6-5.7a1.45 1.45 0 0 1 0-1.6 16 16 0 0 1 3.1-3.4L2.8 4.3 4.1 3Zm3 7.1A13.6 13.6 0 0 0 4.2 12c.8 1.3 3.7 4.5 7.8 4.5 1.1 0 2.1-.2 3-.6l-2-2a2.7 2.7 0 0 1-3.4-3.4l-2.5-2.4ZM12 5.5c5.1 0 8.5 4.1 9.6 5.7.3.5.3 1.1 0 1.6-.4.6-1.3 1.7-2.5 2.8l-1.4-1.4c1-.9 1.7-1.7 2.1-2.2-.8-1.3-3.7-4.5-7.8-4.5-.8 0-1.6.1-2.3.4L8.1 6.3c1.2-.5 2.5-.8 3.9-.8Z" />
            </svg>
          </button>
        </div>
      </label>
      <div v-if="settingsError && !error" class="alert alert--error">{{ settingsError }}</div>
      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <button class="btn btn--primary btn--xl" :disabled="loading">{{ loading ? 'Вход...' : 'Войти' }}</button>
      <div class="login-extra-actions">
        <button class="login-recovery-link" type="button" @click="openRecovery">Забыли пароль?</button>
        <button class="login-recovery-link" type="button" @click="openRegistration">Подать заявку на регистрацию</button>
      </div>
    </form>
  </div>

  <div v-if="recoveryOpen" class="modal-backdrop login-recovery-backdrop" @click.self="closeRecovery">
    <div class="modal login-recovery-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Восстановление доступа</div>
          <h3>Запросить сброс пароля</h3>
          <p class="modal-subtitle">Укажите логин и телефон. Если телефон в профиле не был указан, выберите дом и квартиру для ручной проверки.</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeRecovery">×</button>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>Логин</span>
          <input v-model="recoveryForm.login" type="text" />
        </label>
        <label class="field">
          <span>Контактный телефон</span>
          <input v-model="recoveryForm.contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" @input="onRecoveryContactPhoneInput" />
        </label>
        <label class="field">
          <span>Адрес дома</span>
          <input
            v-model="recoveryForm.house_address"
            type="text"
            list="recovery-house-options"
            placeholder="Начните вводить адрес дома"
            @focus="loadRecoveryHouses(recoveryForm.house_address)"
            @input="onRecoveryHouseInput"
          />
          <datalist id="recovery-house-options">
            <option v-for="house in recoveryHouses" :key="house.id" :value="recoveryHouseLabel(house)" />
          </datalist>
        </label>
        <label class="field">
          <span>Квартира</span>
          <input
            v-model="recoveryForm.apartment"
            type="text"
            list="recovery-apartment-options"
            :disabled="!recoveryForm.house_id"
            :placeholder="recoveryForm.house_id ? 'Выберите квартиру' : 'Сначала выберите дом'"
            @input="onRecoveryApartmentInput"
          />
          <datalist id="recovery-apartment-options">
            <option v-for="apartment in recoveryApartments" :key="apartment.id" :value="recoveryApartmentLabel(apartment)" />
          </datalist>
        </label>
        <div class="muted-box field--span-2">
          {{ recoveryLocationLoading ? 'Загружаем варианты...' : 'Для поиска учетной записи используются логин и контактный телефон. Адрес помогает администратору проверить запрос, если телефон в профиле не указан.' }}
        </div>
        <label class="field field--span-2">
          <span>Комментарий</span>
          <textarea v-model="recoveryForm.message" rows="4" />
        </label>
      </div>

      <div v-if="recoveryError" class="alert alert--error">{{ recoveryError }}</div>
      <div v-if="recoveryMessage" class="alert alert--success">{{ recoveryMessage }}</div>

      <div class="toolbar confirm-modal__actions">
        <button class="btn btn--ghost" type="button" @click="closeRecovery">Закрыть</button>
        <button class="btn btn--primary" type="button" :disabled="recoveryLoading || Boolean(recoveryMessage)" @click="submitRecovery">
          {{ recoveryLoading ? 'Отправляем...' : 'Отправить запрос' }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="registrationOpen" class="modal-backdrop login-recovery-backdrop" @click.self="closeRegistration">
    <div class="modal login-recovery-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Регистрация жителя</div>
          <h3>Подать заявку на регистрацию</h3>
          <p class="modal-subtitle">Укажите данные квартиры. Администратор проверит заявку и создаст учетную запись.</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeRegistration">×</button>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>Логин</span>
          <input v-model="registrationForm.login" type="text" />
        </label>
        <label class="field">
          <span>Контактный телефон</span>
          <input v-model="registrationForm.contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" @input="onRegistrationContactPhoneInput" />
        </label>
        <label class="field field--span-2">
          <span>Имя</span>
          <input v-model="registrationForm.full_name" type="text" />
        </label>
        <label class="field">
          <span>Адрес дома</span>
          <input
            v-model="registrationForm.house_address"
            type="text"
            list="registration-house-options"
            placeholder="Начните вводить адрес дома"
            @focus="loadRegistrationHouses(registrationForm.house_address)"
            @input="onRegistrationHouseInput"
          />
          <datalist id="registration-house-options">
            <option v-for="house in registrationHouses" :key="house.id" :value="registrationHouseLabel(house)" />
          </datalist>
        </label>
        <label class="field">
          <span>Квартира</span>
          <input
            v-model="registrationForm.apartment"
            type="text"
            list="registration-apartment-options"
            :disabled="!registrationForm.house_id"
            :placeholder="registrationForm.house_id ? 'Выберите квартиру' : 'Сначала выберите дом'"
            @input="onRegistrationApartmentInput"
          />
          <datalist id="registration-apartment-options">
            <option v-for="apartment in registrationApartments" :key="apartment.id" :value="registrationApartmentLabel(apartment)" />
          </datalist>
        </label>
        <div class="muted-box field--span-2">
          {{ registrationLocationLoading ? 'Загружаем варианты...' : 'После подтверждения администратор сообщит временный пароль. При первом входе его нужно будет заменить.' }}
        </div>
        <label class="field field--span-2">
          <span>Комментарий</span>
          <textarea v-model="registrationForm.message" rows="4" />
        </label>
      </div>

      <div v-if="registrationError" class="alert alert--error">{{ registrationError }}</div>
      <div v-if="registrationMessage" class="alert alert--success">{{ registrationMessage }}</div>

      <div class="toolbar confirm-modal__actions">
        <button class="btn btn--ghost" type="button" @click="closeRegistration">Закрыть</button>
        <button class="btn btn--primary" type="button" :disabled="registrationLoading || Boolean(registrationMessage)" @click="submitRegistration">
          {{ registrationLoading ? 'Отправляем...' : 'Отправить заявку' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-recovery-link {
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
}

.login-recovery-link:hover {
  text-decoration: underline;
}

.login-extra-actions {
  display: grid;
  gap: 8px;
  justify-items: center;
}

.login-recovery-modal {
  max-width: 720px;
  max-height: none;
  margin: auto 0;
}

.login-recovery-backdrop {
  align-items: start;
  overflow-y: auto;
  padding-block: 24px;
}

.login-recovery-modal textarea {
  resize: none;
}

.login-recovery-modal input:disabled {
  background: rgba(240, 246, 255, 0.72);
  color: var(--muted);
  cursor: not-allowed;
}
</style>
