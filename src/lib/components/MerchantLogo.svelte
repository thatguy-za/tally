<script>
  import Icon from './Icon.svelte';

  /**
   * A small square merchant favicon, falling back to a plain coloured dot
   * when no domain was guessed (see src/lib/logo.js) or the image fails to
   * load. Always reserves the same footprint either way, so rows stay
   * aligned whether or not a logo was found.
   * @type {{ domain?: string|null, color?: string, size?: number, onEdit?: () => void }}
   */
  let { domain = null, color = 'var(--ink-faint)', size = 28, onEdit } = $props();

  let failed = $state(false);
  $effect(() => { domain; failed = false; });
</script>

{#snippet content()}
  {#if domain && !failed}
    <img
      src="https://www.google.com/s2/favicons?domain={domain}&sz=64"
      alt=""
      width={size}
      height={size}
      class="h-full w-full object-contain"
      onerror={() => (failed = true)}
    />
  {:else}
    <span class="dot" style="background:{color}"></span>
  {/if}
{/snippet}

{#if onEdit}
  <button
    type="button"
    class="group relative grid shrink-0 place-items-center overflow-hidden rounded-[7px]"
    style="width:{size}px;height:{size}px;background:var(--paper-sunk)"
    onclick={onEdit}
    title="Change logo"
    aria-label="Change logo"
  >
    {@render content()}
    <span
      class="absolute inset-0 hidden items-center justify-center bg-[var(--ink)]/50 group-hover:flex"
    >
      <Icon name="edit" size={Math.round(size * 0.45)} class="text-white" />
    </span>
  </button>
{:else}
  <span
    class="grid shrink-0 place-items-center overflow-hidden rounded-[7px]"
    style="width:{size}px;height:{size}px;background:var(--paper-sunk)"
  >
    {@render content()}
  </span>
{/if}
