<script setup>
definePageMeta({ middleware: 'auth' })
</script>

<template>
  <TicketsList
    title="Жалобы"
    subtitle="Список обращений жильцов для администратора и диспетчера."
    empty-text="Жалоб пока нет."
  />
</template>
