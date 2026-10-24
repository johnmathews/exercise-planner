<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <main class="flex min-h-svh items-center justify-center px-4 py-12">
    <section
      class="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm"
      :aria-label="title"
    >
      <div class="mb-5 flex items-center gap-2 font-semibold tracking-tight">
        <img src="/favicon.svg" alt="" class="size-7" />
        <span>Workout Log</span>
      </div>
      <h1 class="mb-1 text-xl font-bold tracking-tight">{{ title }}</h1>
      <slot />
    </section>
  </main>
</template>
