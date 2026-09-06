<script>
  import Icon from './Icon.svelte';
  /** @type {{ icon?: string, title: string, hint?: string, cta?: {href:string,label:string} }} */
  let { icon = 'sparkle', title, hint = '', cta = null } = $props();
</script>

<div class="flex flex-col items-center gap-2 px-5 py-14 text-center">
  <span class="mb-1 grid h-11 w-11 place-items-center rounded-full text-[var(--ink-faint)]"
    style="background:var(--paper-sunk)">
    <Icon name={icon} size={18} />
  </span>
  <p class="text-[15px] font-medium" style="font-family:var(--font-display)">{title}</p>
  {#if hint}<p class="max-w-xs text-[13px] text-[var(--ink-faint)]">{hint}</p>{/if}
  {#if cta}<a href={cta.href} class="btn btn-primary mt-2">{cta.label}</a>{/if}
</div>
