<script>
  import { enhance } from '$app/forms';
  import { slide } from 'svelte/transition';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  let { data, form } = $props();

  let showAdd = $state(false);
  let editingId = $state(null);

  const freqLabel = (r) =>
    r.interval_n > 1 ? `every ${r.interval_n} ${r.frequency.replace('ly', 's')}` : r.frequency;

  $effect(() => {
    if (form?.created) showAdd = false;
    if (form?.updated) editingId = null;
  });
</script>

<svelte:head><title>Recurring · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Recurring</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Set once, confirm in a tap</h1>
    <p class="mt-1 text-[13px] text-[var(--ink-faint)]">Rent, salary, subscriptions, the childcare direct debit.</p>
  </div>
  <button class="btn btn-primary" onclick={() => (showAdd = !showAdd)}><Icon name="plus" size={14} /> New</button>
</div>

{#snippet fields(r)}
  <div class="sm:col-span-2">
    <span class="label">Description</span>
    <input class="input" name="description" value={r?.description ?? ''} placeholder="e.g. Netflix" />
  </div>
  <div>
    <span class="label">Amount</span>
    <input class="input tnum" name="amount" inputmode="decimal" value={r ? Math.abs(r.amount) : ''} required />
  </div>
  <div>
    <span class="label">Type</span>
    <select class="input" name="direction" value={r && r.amount >= 0 ? 'in' : 'out'}>
      <option value="out">Outgoing</option>
      <option value="in">Incoming</option>
    </select>
  </div>
  <div>
    <span class="label">Category</span>
    <select class="input" name="category_id" value={r?.category_id ?? ''}>
      <option value="">Uncategorised</option>
      {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </div>
  <div>
    <span class="label">Frequency</span>
    <select class="input" name="frequency" value={r?.frequency ?? 'monthly'}>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
  </div>
  <div>
    <span class="label">Repeat every</span>
    <input class="input tnum" name="interval_n" type="number" min="1" value={r?.interval_n ?? 1} />
  </div>
  <div>
    <span class="label">{r ? 'Next date' : 'First date'}</span>
    <input class="input" name="next_date" type="date" value={r?.next_date ?? data.today} required />
  </div>
  <div>
    <span class="label">End date (optional)</span>
    <input class="input" name="end_date" type="date" value={r?.end_date ?? ''} />
  </div>
  <label class="flex items-center gap-2 text-[13px] sm:col-span-2">
    <input type="checkbox" name="auto_post" checked={r?.auto_post === 1} />
    Post automatically when due (otherwise it waits for your confirmation)
  </label>
{/snippet}

{#if showAdd}
  <form transition:slide method="POST" action="?/create" use:enhance class="card mb-4 grid gap-3 sm:grid-cols-4">
    {@render fields(null)}
    <div class="flex gap-2 sm:col-span-4">
      <button class="btn btn-primary">Create</button>
      <button type="button" class="btn btn-ghost" onclick={() => (showAdd = false)}>Cancel</button>
      {#if form?.error}<span class="self-center text-sm" style="color:var(--negative)">{form.error}</span>{/if}
    </div>
  </form>
{/if}

{#if data.due.length}
  <div class="card mb-4 rise rise-1" style="border-color:var(--gold)">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg">Due now · {data.due.length}</h2>
      <form method="POST" action="?/postAll" use:enhance>
        <button class="btn btn-accent btn-sm"><Icon name="check" size={13} /> Confirm all</button>
      </form>
    </div>
    <ul>
      {#each data.due as r (r.id)}
        <li class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] py-2.5 text-[13px] first:border-0">
          <div>
            <p class="font-medium">{r.description || '—'}</p>
            <p class="text-xs text-[var(--ink-faint)]">{r.next_date} · {r.category_name ?? 'Uncategorised'}</p>
          </div>
          <div class="flex items-center gap-2.5">
            <Money value={r.amount} currency={data.currency} colour="auto" class="font-medium" />
            <form method="POST" action="?/post" use:enhance>
              <input type="hidden" name="id" value={r.id} />
              <button class="btn btn-primary btn-sm">Confirm</button>
            </form>
            <form method="POST" action="?/skip" use:enhance>
              <input type="hidden" name="id" value={r.id} />
              <button class="btn btn-ghost btn-sm">Skip</button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<div class="card card-flush rise rise-2">
  <h2 class="px-5 pb-3 pt-4 text-lg">All schedules</h2>
  {#if data.recurring.length}
    <ul>
      {#each data.recurring as r (r.id)}
        {#if editingId === r.id}
          <li class="border-t border-[var(--border)] p-4" style="background:var(--paper-sunk)">
            <form method="POST" action="?/update" use:enhance class="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={r.id} />
              {@render fields(r)}
              <div class="flex gap-2 sm:col-span-4">
                <button class="btn btn-primary btn-sm">Save</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingId = null)}>Cancel</button>
              </div>
            </form>
          </li>
        {:else}
          <li class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3 text-[13px] {r.active ? '' : 'opacity-45'}">
            <div>
              <p class="flex items-center gap-1.5 font-medium">
                {r.description || '—'}
                <span class="chip">{freqLabel(r)}</span>
                {#if r.auto_post}<span class="chip chip-accent">auto</span>{/if}
              </p>
              <p class="text-xs text-[var(--ink-faint)]">
                Next {r.next_date} · {r.category_name ?? 'Uncategorised'}{r.end_date ? ` · ends ${r.end_date}` : ''}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <Money value={r.amount} currency={data.currency} colour="auto" class="font-medium" />
              <button class="text-[var(--ink-faint)] hover:text-[var(--ink)]" onclick={() => (editingId = r.id)}>
                <Icon name="edit" size={14} />
              </button>
              <form method="POST" action="?/toggle" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="active" value={r.active ? '0' : '1'} />
                <button class="text-xs text-[var(--ink-faint)] hover:underline">{r.active ? 'Pause' : 'Resume'}</button>
              </form>
              <form method="POST" action="?/delete" use:enhance
                onsubmit={(e) => { if (!confirm('Delete this schedule?')) e.preventDefault(); }}>
                <input type="hidden" name="id" value={r.id} />
                <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]"><Icon name="trash" size={14} /></button>
              </form>
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  {:else}
    <p class="border-t border-[var(--border)] px-5 py-12 text-center text-sm text-[var(--ink-faint)]">
      No recurring transactions yet.
    </p>
  {/if}
</div>
