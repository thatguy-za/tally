<script>
  import { fly } from 'svelte/transition';
  import { toasts, dismiss } from '$lib/toast.svelte.js';
  import Icon from './Icon.svelte';
</script>

<div class="toaster">
  {#each toasts as t (t.id)}
    <button
      class="toast"
      transition:fly={{ x: 24, duration: 220 }}
      onclick={() => dismiss(t.id)}
    >
      <span class="t-mark"><Icon name={t.type === 'success' ? 'check' : 'sparkle'} size={11} stroke={2.5} /></span>
      <span>{t.message}</span>
    </button>
  {/each}
</div>
