export function useRoleMenu() {
  const auth = useAuth()

  const canManageHouses = computed(() => {
    if (auth.hasRole('admin')) return true
    if (auth.hasRole('admin_assistant')) return Boolean(auth.user.value?.can_manage_houses)
    return auth.hasRole('dispatcher') && Boolean(auth.user.value?.can_manage_houses)
  })
  const canOpenUsers = computed(() => {
    if (auth.hasRole('admin')) return true
    if (auth.hasRole('admin_assistant')) {
      return Boolean(
        auth.user.value?.can_create_users
        || auth.user.value?.can_ban_residents
        || auth.user.value?.can_manage_executor_schedules
        || auth.user.value?.can_approve_registrations
      )
    }
    return auth.hasRole('dispatcher')
  })
  const canOpenHouseInfo = computed(() => {
    if (auth.hasRole('admin', 'resident')) return true
    if (auth.hasRole('admin_assistant')) return Boolean(auth.user.value?.can_manage_house_info)
    return false
  })
  const canOpenAnalytics = computed(() => {
    if (auth.hasRole('admin', 'dispatcher', 'auditor')) return true
    if (auth.hasRole('admin_assistant')) {
      return Boolean(auth.user.value?.can_manage_executor_schedules || auth.user.value?.can_manage_service_settings || auth.user.value?.can_manage_houses)
    }
    return false
  })
  const canManagePasswordRecovery = computed(() => {
    if (auth.hasRole('admin')) return true
    if (auth.hasRole('admin_assistant')) return Boolean(auth.user.value?.can_manage_password_recovery)
    return false
  })

  const items = computed(() => {
    const role = auth.role.value
    const all = [
      { label: 'Главная', to: '/dashboard', icon: 'home', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor', 'resident'] },
      { label: 'Заявки', to: '/tickets', icon: 'tickets', badge: 'tickets', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor', 'resident'] },
      { label: 'Отзывы', to: '/reviews', icon: 'reviews', roles: ['executor'] },
      { label: 'Объявления', to: '/announcements', icon: 'announcements', badge: 'announcements', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor', 'resident'] },
      { label: 'Сообщения', to: '/messages', icon: 'messages', badge: 'messages', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor', 'resident'] },
      { label: 'Информация по дому', to: '/house-info', icon: 'info', roles: ['admin', 'admin_assistant', 'resident'], guard: () => canOpenHouseInfo.value },
      { label: 'Профиль', to: '/profile', icon: 'profile', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor', 'resident'] },
      { label: 'Жалобы и обращения', to: '/audit', icon: 'complaints', badge: 'complaints', roles: ['admin', 'dispatcher', 'auditor'] },
      { label: 'Замечания', to: '/remarks', icon: 'remarks', badge: 'remarks', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor', 'executor'] },
      { label: 'Пользователи', to: '/users', icon: 'users', badge: 'users', roles: ['admin', 'admin_assistant', 'dispatcher'], guard: () => canOpenUsers.value },
      { label: 'Восстановление доступа', to: '/password-recovery', icon: 'passwordRecovery', badge: 'password_recovery', roles: ['admin', 'admin_assistant'], guard: () => canManagePasswordRecovery.value },
      { label: 'Дома', to: '/houses', icon: 'houses', roles: ['admin', 'admin_assistant', 'dispatcher'], guard: () => canManageHouses.value },
      { label: 'Добавить дом', to: '/houses/create', icon: 'addHouse', roles: ['admin', 'admin_assistant', 'dispatcher'], guard: () => canManageHouses.value },
      { label: 'Аналитика', to: '/analytics', icon: 'analytics', roles: ['admin', 'admin_assistant', 'dispatcher', 'auditor'], guard: () => canOpenAnalytics.value }
    ]

    return all.filter((item) => item.roles.includes(role) && (!item.guard || item.guard()))
  })

  return { items, canManageHouses }
}
