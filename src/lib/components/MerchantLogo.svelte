<script>
  /**
   * A small square merchant favicon, falling back to a plain coloured dot
   * when no domain was guessed (see src/lib/logo.js) or the image fails to
   * load. Always reserves the same footprint either way, so rows stay
   * aligned whether or not a logo was found.
   * @type {{ domain?: string|null, color?: string, size?: number }}
   */
  let { domain = null, color = 'var(--ink-faint)', size = 28 } = $props();

  let failed = $state(false);
  $effect(() => { domain; failed = false; });
</script>

<span
  class="grid shrink-0 place-items-center overflow-hidden rounded-[7px]"
  style="width:{size}px;height:{size}px;background:var(--paper-sunk)"
>
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
</span>
