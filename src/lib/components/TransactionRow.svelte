<script>
  // The one mobile transaction row, shared by the transactions list and the
  // category popup (see docs/mobile-transactions-spec.md). Presentational
  // only — it owns no persistence; every surface wires its own handlers,
  // since they post to different places.
  import Icon from './Icon.svelte';
  import MerchantLogo from './MerchantLogo.svelte';
  import { formatMoney } from '$lib/privacy.svelte.js';
  import { slide } from 'svelte/transition';

  /**
   * @type {{
   *   t: object,
   *   expanded: boolean, onToggleExpand: () => void,
   *   selectable?: boolean,
   *   selected?: boolean, onToggle?: () => void,
   *   showCategory?: boolean,
   *   showRule?: boolean,
   *   onEdit?: (key: string, value: string) => void,
   *   onCategoryChange?: (value: string) => void,
   *   onDelete?: () => void,
   *   onSaveRule?: () => void,
   *   onDismissUncategorised?: () => void,
   *   categories?: {id:number, name:string, color:string}[],
   *   currency: string,
   *   pending?: boolean
   * }}
   */
  let {
    t,
    expanded,
    onToggleExpand,
    selectable = false,
    selected = false,
    onToggle,
    showCategory = true,
    showRule = false,
    onEdit,
    onCategoryChange,
    onDelete,
    onSaveRule,
    onDismissUncategorised,
    categories = [],
    currency,
    pending = false
  } = $props();

  const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  // resolved from `categories` + the current id, same as CategorySelect does
  // internally — never from a possibly-stale category_name/color on `t`, so
  // an optimistic category change shows immediately everywhere in the row
  let cat = $derived(categories.find((c) => String(c.id) === String(t.category_id ?? '')));
  let catColor = $derived(cat?.color || 'var(--border-strong)');
  let catName = $derived(cat?.name ?? null);
</script>

<div style={expanded ? 'background:var(--paper-sunk)' : selected ? 'background:var(--accent-wash)' : ''}>
  <div class="flex items-center gap-3 px-3 py-2.5 transition-opacity {pending ? 'opacity-50' : ''}">
    {#if selectable}
      <input type="checkbox" class="h-[18px] w-[18px] shrink-0" checked={selected} onchange={onToggle}
        aria-label="Select {t.description}" />
    {/if}
    <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
      aria-expanded={expanded} onclick={onToggleExpand}>
      <MerchantLogo domain={t.logo_domain} color={catColor} size={30} />
      <span class="min-w-0 flex-1">
        <span class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-[14px] font-medium">{t.description || '—'}</span>
          <span class="tnum shrink-0 text-[14px] font-semibold" style={t.amount > 0 ? 'color:var(--positive)' : ''}>
            {formatMoney(t.amount, currency)}
          </span>
        </span>
        <span class="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)]">
          <span class="shrink-0">{shortDate(t.date)}</span>
          {#if showCategory}
            <span>·</span>
            <span class="dot shrink-0" style="background:{catColor}"></span>
            <span class="truncate {catName ? '' : 'italic'}">{catName ?? 'Uncategorised'}</span>
          {/if}
          {#if t.notes}<span>·</span><span class="truncate italic">{t.notes}</span>{/if}
          <Icon name="edit" size={12}
            class="ml-auto shrink-0 transition-colors {expanded ? 'text-[var(--accent)]' : ''}" />
        </span>
      </span>
    </button>
  </div>

  {#if expanded}
    <div transition:slide={{ duration: 160 }} class="space-y-3 px-3 pb-3.5">
      <div>
        <label class="label" for="f-desc-{t.id}">Description</label>
        <input class="input" id="f-desc-{t.id}" value={t.description}
          onchange={(e) => onEdit?.('description', e.currentTarget.value)} />
      </div>
      <div class="flex gap-3">
        <div class="flex-1">
          <label class="label" for="f-date-{t.id}">Date</label>
          <input class="input" id="f-date-{t.id}" type="date" value={t.date}
            onchange={(e) => onEdit?.('date', e.currentTarget.value)} />
        </div>
        <div class="flex-1">
          <label class="label" for="f-amt-{t.id}">Amount</label>
          <input class="input tnum text-right" id="f-amt-{t.id}" inputmode="decimal" value={t.amount}
            onchange={(e) => onEdit?.('amount', e.currentTarget.value)} />
        </div>
      </div>
      <div class="flex gap-3">
        <div class="flex-1">
          <label class="label" for="f-cat-{t.id}">Category</label>
          <select class="input" id="f-cat-{t.id}" value={String(t.category_id ?? '')}
            onchange={(e) => onCategoryChange?.(e.currentTarget.value)}>
            <option value="">Uncategorised</option>
            {#each categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
          </select>
        </div>
        <div class="flex-1">
          <label class="label" for="f-notes-{t.id}">Notes</label>
          <input class="input" id="f-notes-{t.id}" value={t.notes || ''} placeholder="—" maxlength="280"
            onchange={(e) => onEdit?.('notes', e.currentTarget.value)} />
        </div>
      </div>
      <div class="flex items-center gap-2 pt-0.5">
        {#if !t.category_id && onDismissUncategorised}
          <button type="button" class="text-[11px] text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--ink)]"
            onclick={onDismissUncategorised}>
            {t.dismissed_uncategorised ? 'Restore reminder' : "Doesn't need a category"}
          </button>
        {/if}
        {#if showRule}
          <button type="button" class="btn btn-ghost btn-sm ml-auto" onclick={onSaveRule}>
            <Icon name="repeat" size={13} /> Save as rule
          </button>
        {/if}
        <button type="button" class="btn btn-ghost btn-sm {showRule ? '' : 'ml-auto'}" style="color:var(--negative)"
          onclick={onDelete}>
          <Icon name="trash" size={13} /> Delete
        </button>
      </div>
    </div>
  {/if}
</div>
