<script>
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import { toast } from '$lib/toast.svelte.js';

  /** @type {{ onboarding: { isAdmin: boolean, ai: { configured: boolean, keyFromEnv: boolean, model: string, models: {id:string,label:string}[] }, accounts: any[], categories: any[] } }} */
  let { onboarding } = $props();

  // Fixed for the life of this overlay instance — whether the API key step
  // shows is decided once, at mount. Recomputing this from live `onboarding`
  // data (e.g. right after the key is saved) would shrink the array under a
  // `step` index that's mid-flight and silently skip whatever step came next.
  const STEPS = untrack(() =>
    (onboarding.isAdmin && !onboarding.ai.configured ? ['api-key'] : []).concat([
      'accounts',
      'categories',
      'import'
    ])
  );

  let step = $state(0);
  let apiKeyError = $state('');
  let apiKeySaved = $state(untrack(() => onboarding.ai.configured));
  let selectedModel = $state(untrack(() => onboarding.ai.model));
  let testing = $state(false);
  let testResult = $state('');
  let testError = $state('');
  let newAccountName = $state('');
  let newAccountColor = $state('#6366f1');
  let newCategoryName = $state('');
  let newCategoryKind = $state('expense');
  let newCategoryColor = $state('#7b8a5a');
  let closing = $state(false);

  const kindLabel = {
    income: 'Income',
    expense: 'Spending',
    saving: 'Savings',
    transfer: 'Transfer',
    opening_balance: 'Opening balance'
  };
  let grouped = $derived(
    ['income', 'expense', 'saving', 'transfer', 'opening_balance']
      .map((kind) => ({ kind, items: onboarding.categories.filter((c) => c.kind === kind) }))
      .filter((g) => g.items.length)
  );

  function next() {
    if (step < STEPS.length - 1) step++;
  }

  async function exit() {
    closing = true;
    await fetch('/onboarding?/finish', { method: 'POST', body: new FormData() });
    await invalidateAll();
  }

  async function goImport() {
    closing = true;
    await fetch('/onboarding?/finish', { method: 'POST', body: new FormData() });
    await invalidateAll();
    goto('/transactions?new=1');
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Set up Tally">
  <div class="card w-full max-w-lg rise" style="max-height:85vh;overflow-y:auto">
    <div class="mb-5 flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        {#each STEPS as s, i}
          <span class="h-1.5 w-6 rounded-full" style="background:{i <= step ? 'var(--accent)' : 'var(--border)'}"></span>
        {/each}
      </div>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={exit}
        disabled={closing}
        aria-label="Close setup — you can always finish this later in Settings"
        title="Close — you can always finish this later in Settings"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    {#if STEPS[step] === 'api-key'}
      <span class="mb-3 grid h-10 w-10 place-items-center rounded-[11px]" style="background:var(--accent-wash)">
        <Icon name="sparkle" size={19} class="text-[var(--accent)]" />
      </span>
      <h2 class="text-xl" style="font-family:var(--font-display)">Connect Claude</h2>
      <p class="mt-1.5 text-[13px] text-[var(--ink-faint)]">
        Add an Anthropic API key so everyone on this instance can opt in to AI transaction
        categorisation. Usage is billed to this key by Anthropic — create one at
        <span class="text-[var(--ink-soft)]">console.anthropic.com</span>. You can skip this and add
        it later in Server settings.
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
              apiKeySaved = !!result.data?.configured;
              if (apiKeySaved) {
                toast('API key saved');
                await invalidateAll();
                next();
              } else {
                await invalidateAll();
              }
            } else if (result.type === 'failure') {
              apiKeyError = result.data?.error || 'Something went wrong.';
            }
          };
        }}
      >
        <label class="label" for="ob-api-key">API key</label>
        <input class="input" id="ob-api-key" name="api_key" type="password" autocomplete="off" placeholder="sk-ant-…" />
        <div class="mt-3">
          <label class="label" for="ob-model">Model</label>
          <select class="input" id="ob-model" name="model" bind:value={selectedModel}>
            {#each onboarding.ai.models as m}<option value={m.id}>{m.label}</option>{/each}
          </select>
          <p class="mt-1 text-xs text-[var(--ink-faint)]">Haiku is the cheapest and is usually plenty for categorisation.</p>
        </div>
        {#if apiKeyError}<p class="mt-1.5 text-xs" style="color:var(--negative)">{apiKeyError}</p>{/if}
        {#if testResult}<p class="mt-1.5 text-xs" style="color:var(--positive)">{testResult}</p>{/if}
        {#if testError}<p class="mt-1.5 text-xs" style="color:var(--negative)">{testError}</p>{/if}
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" formaction="/onboarding?/test" class="btn btn-ghost" disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button type="submit" class="btn btn-primary">Save & continue</button>
          <button type="button" class="btn btn-ghost" onclick={next}>Skip for now</button>
        </div>
      </form>
    {:else if STEPS[step] === 'accounts'}
      <span class="mb-3 grid h-10 w-10 place-items-center rounded-[11px]" style="background:var(--accent-wash)">
        <Icon name="wallet" size={19} class="text-[var(--accent)]" />
      </span>
      <h2 class="text-xl" style="font-family:var(--font-display)">Your accounts</h2>
      <p class="mt-1.5 text-[13px] text-[var(--ink-faint)]">
        We've started you off with one. Rename it, or add more if you want to track a current
        account and a savings account separately.
      </p>
      <ul class="mt-4 space-y-2">
        {#each onboarding.accounts as a (a.id)}
          <li>
            <form
              method="POST"
              action="/settings?/renameAccount"
              class="flex items-center gap-2"
              use:enhance={() => async ({ result }) => {
                if (result.type === 'success') await invalidateAll();
              }}
            >
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="color" id="ob-acct-color-{a.id}" value={a.color} />
              <ColorPicker
                value={a.color}
                size="h-8 w-8"
                label="Colour for {a.name}"
                onchange={(c) => {
                  const input = document.getElementById(`ob-acct-color-${a.id}`);
                  input.value = c;
                  input.form?.requestSubmit();
                }}
              />
              <input
                name="name"
                value={a.name}
                class="input flex-1"
                aria-label="Account name"
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </form>
          </li>
        {/each}
      </ul>
      <form
        method="POST"
        action="/settings?/addAccount"
        class="mt-3 flex items-center gap-2"
        use:enhance={() => async ({ result }) => {
          if (result.type === 'success') {
            newAccountName = '';
            await invalidateAll();
          }
        }}
      >
        <input type="hidden" name="color" value={newAccountColor} />
        <ColorPicker bind:value={newAccountColor} size="h-8 w-8" label="Colour for new account" />
        <input class="input flex-1" name="name" placeholder="Add another account…" bind:value={newAccountName} />
        <button class="btn btn-ghost" disabled={!newAccountName.trim()}>Add</button>
      </form>
      <div class="mt-5 flex justify-end">
        <button class="btn btn-primary" onclick={next}>Continue</button>
      </div>
    {:else if STEPS[step] === 'categories'}
      <span class="mb-3 grid h-10 w-10 place-items-center rounded-[11px]" style="background:var(--accent-wash)">
        <Icon name="reports" size={19} class="text-[var(--accent)]" />
      </span>
      <h2 class="text-xl" style="font-family:var(--font-display)">Confirm your categories</h2>
      <p class="mt-1.5 text-[13px] text-[var(--ink-faint)]">
        We've split these into income and spending already — move anything that landed in the
        wrong place, or add your own.
      </p>
      <div class="mt-4 space-y-3">
        {#each grouped as g}
          <div>
            <p class="kicker mb-1.5">{kindLabel[g.kind]}</p>
            <ul class="divide-y divide-[var(--border)] rounded-[9px] border border-[var(--border)]">
              {#each g.items as c (c.id)}
                <li class="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="dot shrink-0" style="background:{c.color}"></span>
                    <span class="truncate">{c.name}</span>
                  </span>
                  <form
                    method="POST"
                    action="/settings?/categoryKind"
                    use:enhance={() => async ({ result }) => {
                      if (result.type === 'success') await invalidateAll();
                    }}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <select
                      name="kind"
                      class="cell text-[12px]"
                      value={c.kind}
                      aria-label="What kind of category {c.name} is"
                      onchange={(e) => e.currentTarget.form?.requestSubmit()}
                    >
                      <option value="expense">Spending</option>
                      <option value="income">Income</option>
                      <option value="saving">Savings</option>
                      <option value="transfer">Transfer</option>
                      <option value="opening_balance">Opening balance</option>
                    </select>
                  </form>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
      <form
        method="POST"
        action="/settings?/addCategory"
        class="mt-3 flex flex-wrap items-center gap-2"
        use:enhance={() => async ({ result }) => {
          if (result.type === 'success') {
            newCategoryName = '';
            await invalidateAll();
          }
        }}
      >
        <input type="hidden" name="color" value={newCategoryColor} />
        <ColorPicker bind:value={newCategoryColor} size="h-8 w-8" label="Colour for new category" />
        <input class="input min-w-0 flex-1" name="name" placeholder="Add a category…" bind:value={newCategoryName} />
        <select class="input w-auto" name="kind" bind:value={newCategoryKind}>
          <option value="expense">Spending</option>
          <option value="income">Income</option>
          <option value="saving">Savings</option>
          <option value="transfer">Transfer</option>
          <option value="opening_balance">Opening balance</option>
        </select>
        <button class="btn btn-ghost" disabled={!newCategoryName.trim()}>Add</button>
      </form>
      <div class="mt-5 flex justify-end">
        <button class="btn btn-primary" onclick={next}>Continue</button>
      </div>
    {:else if STEPS[step] === 'import'}
      <span class="mb-3 grid h-10 w-10 place-items-center rounded-[11px]" style="background:var(--accent-wash)">
        <Icon name="upload" size={19} class="text-[var(--accent)]" />
      </span>
      <h2 class="text-xl" style="font-family:var(--font-display)">Add your first transactions</h2>
      <p class="mt-1.5 text-[13px] text-[var(--ink-faint)]">
        Export a CSV or OFX statement from your bank and drop it in — Tally will guess the columns
        and suggest categories for you to review before anything is saved.
      </p>
      <div class="mt-5 flex items-center gap-2">
        <button class="btn btn-primary" onclick={goImport} disabled={closing}>Import now</button>
        <button class="btn btn-ghost" onclick={exit} disabled={closing}>I'll do this later</button>
      </div>
    {/if}
  </div>
</div>
