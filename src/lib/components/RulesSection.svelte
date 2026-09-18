<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import { toast } from '$lib/toast.svelte.js';

  /**
   * The "Auto-categorisation rules" card — shown on both Settings and
   * Categories, so it always posts to the settings page's own actions by
   * absolute path regardless of which page it's embedded in.
   * @type {{ categories: {id:number,name:string}[], rules: object[] }}
   */
  let { categories, rules } = $props();

  let newRuleCategoryId = $state('');

  function submitAdd() {
    return async ({ result }) => {
      if (result.type === 'success') {
        newRuleCategoryId = '';
        toast(result.data?.applied ? `Saved · ${result.data.applied} transaction(s) categorised` : 'Rule saved');
        await invalidateAll();
      } else {
        toast(result.data?.error || 'Could not save rule.', { type: 'info' });
      }
    };
  }
  function submitDelete() {
    return async ({ result }) => {
      if (result.type === 'success') await invalidateAll();
    };
  }
  function submitApply() {
    return async ({ result }) => {
      if (result.type === 'success') {
        toast(`${result.data?.applied ?? 0} transaction(s) categorised`);
        await invalidateAll();
      } else {
        toast(result.data?.error || 'Could not run rules.', { type: 'info' });
      }
    };
  }
</script>

<div class="card">
  <div class="mb-1 flex items-center justify-between">
    <h2 class="text-lg">Auto-categorisation rules</h2>
    <form method="POST" action="/settings?/applyRules" use:enhance={submitApply}>
      <input type="hidden" name="scope" value="uncategorised" />
      <button class="btn btn-ghost btn-sm">Run on uncategorised</button>
    </form>
  </div>
  <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
    If a description contains the text, the transaction gets that category — applied on import,
    on manual entry, and whenever you run them. Higher priority wins.
  </p>
  <ul class="mb-4 divide-y divide-[var(--border)]">
    {#each rules as r}
      <li class="flex items-center justify-between py-2 text-[13px]">
        <span>
          “{r.match_text}” →
          <span class="font-medium" style="color:{r.category_color}">{r.category_name}</span>
          {#if r.priority}<span class="ml-1 text-xs text-[var(--ink-faint)]">p{r.priority}</span>{/if}
        </span>
        <form method="POST" action="/settings?/deleteRule" use:enhance={submitDelete}>
          <input type="hidden" name="id" value={r.id} />
          <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]"><Icon name="trash" size={14} /></button>
        </form>
      </li>
    {:else}
      <li class="py-2 text-sm text-[var(--ink-faint)]">No rules yet.</li>
    {/each}
  </ul>
  <form method="POST" action="/settings?/addRule" use:enhance={submitAdd} class="flex flex-wrap items-end gap-3">
    <div class="min-w-[160px] flex-1">
      <label class="label" for="r-match">Description contains</label>
      <input class="input" id="r-match" name="match_text" placeholder="e.g. SPAR" required />
    </div>
    <div>
      <label class="label" for="r-cat">Category</label>
      <input type="hidden" name="category_id" value={newRuleCategoryId} />
      <CategorySelect {categories} value={newRuleCategoryId}
        triggerClass="input" placeholder="Choose…"
        onChange={(v) => (newRuleCategoryId = v)}
        onCreated={() => invalidateAll()} />
    </div>
    <div class="w-20">
      <label class="label" for="r-pri">Priority</label>
      <input class="input tnum" id="r-pri" name="priority" type="number" value="0" />
    </div>
    <label class="mb-2.5 flex items-center gap-1.5 text-[13px] text-[var(--ink-faint)]">
      <input type="checkbox" name="overwrite" /> also recategorise matching transactions that already have one
    </label>
    <button class="btn btn-primary">Add rule</button>
  </form>
</div>
