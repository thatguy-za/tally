<script>
  import { fly } from 'svelte/transition';
  import { toasts, dismiss } from '$lib/toast.svelte.js';
  import Icon from './Icon.svelte';
</script>

<div class="toaster">
  {#each toasts as t (t.id)}
    <div class="toast" transition:fly={{ x: 24, duration: 220 }}>
      <button
        type="button"
        class="flex flex-1 items-center gap-[0.6rem] text-left"
        onclick={() => (t.onClick ? t.onClick() : dismiss(t.id))}
      >
        <span class="t-mark">
          <Icon name={t.type === 'success' ? 'check' : t.type === 'update' ? 'download' : 'sparkle'} size={11} stroke={2.5} />
        </span>
        <span>{t.message}</span>
      </button>
      {#if t.dismissible}
        <button type="button" aria-label="Dismiss" class="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
          onclick={() => dismiss(t.id)}>
          <Icon name="x" size={13} />
        </button>
      {/if}
    </div>
  {/each}
</div>
