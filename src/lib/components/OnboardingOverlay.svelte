<script>
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { toast } from '$lib/toast.svelte.js';

  /** @type {{ onboarding: { ai: { provider: string, providers: {id:string,label:string}[], configured: boolean, keyFromEnv: boolean, model: string, models: {id:string,label:string}[], modelsByProvider: Record<string,{id:string,label:string}[]> } } }} */
  let { onboarding } = $props();

  let apiKeyError = $state('');
  let selectedProvider = $state(untrack(() => onboarding.ai.provider));
  let selectedModel = $state(untrack(() => onboarding.ai.model));
  let models = $derived(onboarding.ai.modelsByProvider[selectedProvider] ?? []);
  function defaultModelFor(provider) {
    if (provider === onboarding.ai.provider) return onboarding.ai.model;
    return onboarding.ai.modelsByProvider[provider]?.[0]?.id ?? '';
  }
  $effect(() => {
    selectedModel = defaultModelFor(selectedProvider);
  });
  let testing = $state(false);
  let testResult = $state('');
  let testError = $state('');
  let closing = $state(false);

  async function exit() {
    closing = true;
    await fetch('/onboarding?/finish', { method: 'POST', body: new FormData() });
    await invalidateAll();
  }

  function onWindowKey(e) {
    if (e.key === 'Escape' && !closing) exit();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="Connect an AI assistant"
  onclick={(e) => e.target === e.currentTarget && !closing && exit()}>
  <div class="card w-full max-w-lg rise" style="max-height:85vh;overflow-y:auto">
    <div class="mb-5 flex items-start justify-between gap-3">
      <span class="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)]" style="background:var(--accent-wash)">
        <Icon name="sparkle" size={19} class="text-[var(--accent)]" />
      </span>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={exit}
        disabled={closing}
        aria-label="Close — you can always add this later in Settings"
        title="Close — you can always add this later in Settings"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    <h2 class="text-xl" style="font-family:var(--font-display)">Connect an AI assistant</h2>
    <p class="mt-1.5 text-[13px] text-[var(--ink-faint)]">
      Add an API key so everyone on this instance can opt in to AI transaction
      categorisation. Usage is billed to this key by the provider — create one at
      <span class="text-[var(--ink-soft)]">{selectedProvider === 'openai' ? 'platform.openai.com' : 'console.anthropic.com'}</span>.
      You can skip this and add it later in Server settings.
    </p>
    <form
      method="POST"
      action="/onboarding?/apiKey"
      class="mt-4"
      use:enhance={({ action }) => {
        const testing_ = action.search === '?/test';
        apiKeyError = '';
        if (testing_) {
          testing = true;
          testResult = '';
          testError = '';
        }
        return async ({ result, action }) => {
          if (action.search === '?/test') {
            testing = false;
            if (result.type === 'success') testResult = result.data?.msg || 'Connected.';
            else if (result.type === 'failure') testError = result.data?.error || 'Test failed.';
            return;
          }
          if (result.type === 'success') {
            if (result.data?.configured) {
              toast('API key saved');
              await exit();
            } else {
              await invalidateAll();
            }
          } else if (result.type === 'failure') {
            apiKeyError = result.data?.error || 'Something went wrong.';
          }
        };
      }}
    >
      <label class="label" for="ob-provider">Provider</label>
      <select class="input" id="ob-provider" name="provider" bind:value={selectedProvider}>
        {#each onboarding.ai.providers as p}<option value={p.id}>{p.label}</option>{/each}
      </select>
      <div class="mt-3">
        <label class="label" for="ob-api-key">API key</label>
        <input class="input" id="ob-api-key" name="api_key" type="password" autocomplete="off"
          placeholder={selectedProvider === 'openai' ? 'sk-…' : 'sk-ant-…'} />
      </div>
      <div class="mt-3">
        <label class="label" for="ob-model">Model</label>
        <select class="input" id="ob-model" name="model" bind:value={selectedModel}>
          {#each models as m}<option value={m.id}>{m.label}</option>{/each}
        </select>
        <p class="mt-1 text-xs text-[var(--ink-faint)]">The cheapest model is usually plenty for categorisation.</p>
      </div>
      {#if apiKeyError}<p class="mt-1.5 text-xs" style="color:var(--negative)">{apiKeyError}</p>{/if}
      {#if testResult}<p class="mt-1.5 text-xs" style="color:var(--positive)">{testResult}</p>{/if}
      {#if testError}<p class="mt-1.5 text-xs" style="color:var(--negative)">{testError}</p>{/if}
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" formaction="/onboarding?/test" class="btn btn-ghost" disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button type="submit" class="btn btn-primary">Save & finish</button>
        <button type="button" class="btn btn-ghost" onclick={exit} disabled={closing}>Skip for now</button>
      </div>
    </form>
  </div>
</div>
