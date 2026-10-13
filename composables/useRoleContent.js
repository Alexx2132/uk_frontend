export function useRoleContent() {
  const auth = useAuth()

  const role = computed(() => auth.role.value)

  const dashboardMeta = computed(() => {
    if (role.value === 'resident') {
      return {
        title: 'Мои текущие заявки',
        subtitle: 'Здесь собраны ваши активные обращения, объявления для дома и быстрый доступ к информации по дому.'
      }
    }

    if (role.value === 'executor') {
      return {
        title: 'Рабочая панель исполнителя',
        subtitle: 'Здесь видны назначенные заявки, отзывы жильцов, замечания и личный график работы.'
      }
    }

    if (role.value === 'dispatcher') {
      return {
        title: 'Панель диспетчера',
        subtitle: 'Общая сводка по заявкам.'
      }
    }

    if (role.value === 'auditor') {
      return {
        title: 'Панель аудитора',
        subtitle: 'Контроль жалоб, замечаний и качества отработки заявок по системе.'
      }
    }

    return {
      title: 'Панель управления',
      subtitle: 'Общая сводка по заявкам, пользователям и ключевым операциям сервиса.'
    }
  })

  const profileMeta = computed(() => {
    if (role.value === 'resident') {
      return {
        title: 'Профиль жильца',
        subtitle: 'Личные данные, адрес проживания и быстрый доступ к вашим обращениям и объявлениям.'
      }
    }

    if (role.value === 'executor') {
      return {
        title: 'Профиль исполнителя',
        subtitle: 'Рабочие контакты, специализации, график, выходные и служебные заметки.'
      }
    }

    if (role.value === 'dispatcher') {
      return {
        title: 'Профиль диспетчера',
        subtitle: 'Личные данные и доступы, которые используются в ежедневной работе с заявками и домами.'
      }
    }

    if (role.value === 'auditor') {
      return {
        title: 'Профиль аудитора',
        subtitle: 'Личные данные и инструменты контроля жалоб, замечаний и сроков реакции.'
      }
    }

    return {
      title: 'Профиль администратора',
      subtitle: 'Личные данные и системные настройки веб-версии, которые влияют на весь сервис.'
    }
  })

  const ticketsMeta = computed(() => {
    if (role.value === 'resident') {
      return {
        title: 'Мои заявки',
        subtitle: 'Создание новых заявок, принятие выполненных работ, отзывы и жалобы по качеству.',
        emptyText: 'У вас пока нет заявок.'
      }
    }

    if (role.value === 'executor') {
      return {
        title: 'Заявки исполнителя',
        subtitle: 'Назначенные, выполняемые и завершённые заявки, а также отзывы жильцов по вашим работам.',
        emptyText: 'Назначенных заявок пока нет.'
      }
    }

    if (role.value === 'dispatcher') {
      return {
        title: 'Заявки',
        subtitle: 'Оперативный список заявок по домам, жильцам и исполнителям.',
        emptyText: 'Заявок пока нет.'
      }
    }

    if (role.value === 'auditor') {
      return {
        title: 'Заявки',
        subtitle: 'Просмотр заявок для контроля качества и последующих жалоб.',
        emptyText: 'Заявок пока нет.'
      }
    }

    return {
      title: 'Заявки',
      subtitle: 'Общий список заявок по системе.',
      emptyText: 'Заявок пока нет.'
    }
  })

  return {
    dashboardMeta,
    profileMeta,
    ticketsMeta
  }
}
