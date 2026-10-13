<script setup>
definePageMeta({ middleware: 'auth' })

const { ticketsMeta } = useRoleContent()
</script>

<template>
  <TicketsList
    :title="ticketsMeta.title"
    :subtitle="ticketsMeta.subtitle"
    :empty-text="ticketsMeta.emptyText"
  />
</template>
