<script>
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import Money from './Money.svelte';
  import MerchantLogo from './MerchantLogo.svelte';
  import { guessDomain } from '$lib/logo.js';
  import { toast } from '$lib/toast.svelte.js';

  /**
   * The "Auto-categorisation rules" card — shown on both Settings and
   * Categories, so it always posts to the settings page's own actions by
   * absolute path regardless of which page it's embedded in.
   * @type {{ categories: {id:number,name:string}[], rules: object[], currency?: string }}
   */
  let { categories, rules, currency = 'EUR' } = $props();

  let addingNew = $state(false);
  let newRuleCategoryId = $state('');
  let addError = $state('');

  function submitAdd() {
    return async ({ result }) => {
      if (result.type === 'success') {
        addingNew = false;
        newRuleCategoryId = '';
        addError = '';
        toast(result.data?.applied ? `Saved · ${result.data.applied} transaction(s) categorised` : 'Rule saved');
        await invalidateAll();
      } else {
        addError = result.data?.error || 'Could not save rule.';
      }
    };
  }
  function submitDelete() {
    return async ({ result }) => {
      if (result.type === 'success') await invalidateAll();
    };
  }

  // ---- re-run categorisation: preview the diff across every transaction
  // (categorised or not), let the user drop any row they don't want, then
  // save only what's left checked ----
  let previewing = $state(false);
  let preview = $state(null); // { changes, accepted: Set<id> } | null
  let applying = $state(false);

  async function runPreview() {
    previewing = true;
    try {
      const res = await fetch('/settings?/previewRerun', { method: 'POST', body: new FormData(), headers: { 'x-sveltekit-action': 'true' } });
      const result = deserialize(await res.text());
      if (result.type !== 'success') {
        toast(result.data?.error || 'Could not check your rules.', { type: 'info' });
        return;
      }
      const changes = result.data.changes;
      if (!changes.length) {
        toast('Nothing would change — every transaction already matches your rules.');
        return;
      }
      preview = { changes, accepted: new Set(changes.map((c) => c.id)) };
    } catch {
      toast('Could not check your rules.', { type: 'info' });
    } finally {
      previewing = false;
    }
  }

  function toggleAccept(id) {
    const next = new Set(preview.accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    preview = { ...preview, accepted: next };
  }

  async function saveApproved() {
    const changes = preview.changes
      .filter((c) => preview.accepted.has(c.id))
      .map((c) => ({ id: c.id, category_id: c.to_category_id }));
    if (!changes.length) { preview = null; return; }
    applying = true;
    try {
      const body = new FormData();
      body.set('changes', JSON.stringify(changes));
      const res = await fetch('/settings?/applyRerun', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
      const result = deserialize(await res.text());
      if (result.type === 'success') {
        toast(`${result.data?.applied ?? 0} transaction(s) categorised`);
        preview = null;
        await invalidateAll();
      } else {
        toast(result.data?.error || 'Could not save those changes.', { type: 'info' });
      }
    } catch {
      toast('Could not save those changes.', { type: 'info' });
    } finally {
      applying = false;
    }
  }
</script>

<div class="card">
  <div class="mb-1 flex items-center justify-between">
    <h2 class="text-lg">Auto-categorisation rules</h2>
    <button type="button" class="btn btn-ghost btn-sm flex items-center gap-1.5" onclick={runPreview} disabled={previewing}>
      <Icon name="repeat" size={13} class={previewing ? 'animate-spin' : ''} />
      {previewing ? 'Checking…' : 'Re-run categorisation'}
    </button>
  </div>
  <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
    If a description contains the text, the transaction gets that category — applied on import,
    on manual entry, and whenever you run them. Higher priority wins. Re-running checks every
    transaction, categorised or not, and lets you review the changes before saving.
  </p>
  <div class="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
    <table class="w-full text-[13px]">
      <thead>
        <tr class="border-b border-[var(--border)] text-left">
          <th class="th px-3 py-2">Rule</th>
          <th class="th px-3 py-2 w-16 text-right">Priority</th>
          <th class="w-9"></th>
        </tr>
      </thead>
      <tbody>
        {#each rules as r (r.id)}
          <tr class="group border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--paper-sunk)]/60">
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2.5">
                <MerchantLogo domain={guessDomain(r.match_text)} color={r.category_color} size={22} />
                <span>
                  “{r.match_text}” →
                  <span class="font-medium" style="color:{r.category_color}">{r.category_name}</span>
                </span>
              </div>
            </td>
            <td class="px-3 py-2.5 text-right tnum text-[var(--ink-faint)]">{r.priority}</td>
            <td class="px-3 py-2.5">
              <form method="POST" action="/settings?/deleteRule" use:enhance={submitDelete} class="flex justify-end opacity-70 transition group-hover:opacity-100">
                <input type="hidden" name="id" value={r.id} />
                <button class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]" data-tip="Delete rule" aria-label="Delete rule">
                  <Icon name="trash" size={14} />
                </button>
              </form>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="3" class="py-2 px-3 text-sm text-[var(--ink-faint)]">No rules yet.</td>
          </tr>
        {/each}
        {#if addingNew}
          <tr class="border-b border-[var(--border)] last:border-0">
            <td colspan="3" class="p-3" style="background:var(--paper-sunk)">
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
                <div class="flex items-center gap-2">
                  <button class="btn btn-primary btn-sm">Add</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick={() => { addingNew = false; addError = ''; }}>Cancel</button>
                  {#if addError}<span class="text-sm" style="color:var(--negative)">{addError}</span>{/if}
                </div>
              </form>
            </td>
          </tr>
        {:else}
          <tr class="border-b border-[var(--border)] last:border-0">
            <td colspan="3" class="p-0">
              <button type="button" class="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
                onclick={() => (addingNew = true)}>
                <Icon name="plus" size={13} /> Add rule
              </button>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

{#if preview}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Preview re-run categorisation"
    onclick={(e) => e.target === e.currentTarget && !applying && (preview = null)}>
    <div class="card w-full max-w-2xl rise max-h-[85vh] overflow-y-auto pb-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="kicker mb-1">Re-run categorisation</p>
          <h2 class="text-xl" style="font-family:var(--font-display)">
            {preview.accepted.size} of {preview.changes.length} change{preview.changes.length === 1 ? '' : 's'} selected
          </h2>
        </div>
        <button
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          onclick={() => (preview = null)} aria-label="Close" disabled={applying}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="card card-flush">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b border-[var(--border)] text-left">
                <th class="w-10 py-2 pl-4"></th>
                <th class="th px-2 py-2">Date</th>
                <th class="th px-2 py-2">Description</th>
                <th class="th px-2 py-2 text-right">Amount</th>
                <th class="th px-2 py-2">From</th>
                <th class="th px-2 py-2">To</th>
              </tr>
            </thead>
            <tbody>
              {#each preview.changes as c (c.id)}
                <tr class="border-b border-[var(--border)] last:border-0">
                  <td class="py-2 pl-4">
                    <input type="checkbox" checked={preview.accepted.has(c.id)} onchange={() => toggleAccept(c.id)} />
                  </td>
                  <td class="tnum whitespace-nowrap px-2 py-2 text-[var(--ink-faint)]">{c.date}</td>
                  <td class="px-2 py-2">{c.description || '—'}</td>
                  <td class="px-2 py-2 text-right">
                    <Money value={c.amount} currency={currency} colour="auto" class="font-medium" />
                  </td>
                  <td class="px-2 py-2">
                    {#if c.from_category_name}
                      <span class="flex items-center gap-1.5">
                        <span class="dot shrink-0" style="background:{c.from_category_color}"></span>
                        <span class="truncate text-[var(--ink-faint)]">{c.from_category_name}</span>
                      </span>
                    {:else}
                      <span class="text-[var(--ink-faint)]">Uncategorised</span>
                    {/if}
                  </td>
                  <td class="px-2 py-2">
                    <span class="flex items-center gap-1.5">
                      <span class="dot shrink-0" style="background:{c.to_category_color}"></span>
                      <span class="truncate font-medium">{c.to_category_name}</span>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <button type="button" class="btn btn-primary" disabled={applying || !preview.accepted.size} onclick={saveApproved}>
          {applying ? 'Saving…' : `Save ${preview.accepted.size} change${preview.accepted.size === 1 ? '' : 's'}`}
        </button>
        <button type="button" class="btn btn-ghost" onclick={() => (preview = null)} disabled={applying}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
