<script>
  import Icon from '$lib/components/Icon.svelte';
  import ChatBarChart from '$lib/components/ChatBarChart.svelte';
  import { formatMoney } from '$lib/privacy.svelte.js';
  let { data } = $props();

  const STARTERS = [
    { icon: 'transactions', text: 'How much did I spend on groceries this month?' },
    { icon: 'reports', text: 'Chart my spending by category this month' },
    { icon: 'budgets', text: 'Am I over budget on anything right now?' },
    { icon: 'sparkle', text: 'How does this month compare to my usual?' }
  ];

  // shown one at a time, picked fresh for each message, while Tori works
  const THINKING_LINES = [
    'Checking the ledger',
    'Counting the beans',
    'Shaking the piggy bank',
    'Consulting the spreadsheet',
    'Dusting off the abacus',
    'Polishing the decimal points',
    'Interrogating the receipts',
    'Balancing the books',
    'Negotiating with the numbers',
    'Summoning the accountants',
    'Reconciling the vibes',
    'Auditing the couch cushions',
    'Batting the numbers around',
    'Checking under the mattress',
    'Asking the calculator nicely',
    'Purring over the spreadsheet',
    'Arguing with a rounding error',
    'Waking up the actuary',
    'Filing this under "miscellaneous"',
    'Explaining itself to the auditor',
    'Stacking the coins',
    'Bribing the exchange rate',
    'Carrying the one',
    'Chasing down a stray euro',
    'Squinting at the fine print'
  ];

  let messages = $state([]); // { role: 'user'|'assistant', content: string, charts?: object[] }
  let input = $state('');
  let sending = $state(false);
  let thinkingLine = $state('');
  let error = $state('');
  let listEl = $state();

  $effect(() => {
    messages.length;
    sending;
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  });

  async function send(text) {
    text = (text ?? input).trim();
    if (!text || sending) return;
    input = '';
    error = '';
    messages = [...messages, { role: 'user', content: text }];
    sending = true;
    thinkingLine = THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)];
    try {
      const history = messages.map(({ role, content }) => ({ role, content }));
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'Something went wrong.');
      messages = [
        ...messages,
        { role: 'assistant', content: body.text || "I couldn't come up with an answer.", charts: body.charts || [] }
      ];
    } catch (e) {
      error = e.message || 'Something went wrong.';
    } finally {
      sending = false;
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<svelte:head><title>Ask Tori · Tally</title></svelte:head>

<div class="mb-7">
  <p class="kicker mb-2">Your financial advisor</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Ask Tori</h1>
</div>

<div class="card flex h-[65vh] min-h-[420px] flex-col">
  <div bind:this={listEl} class="flex-1 space-y-4 overflow-y-auto pr-1">
    {#if !messages.length}
      <div class="flex h-full flex-col justify-center py-6">
        <p class="text-lg" style="font-family:var(--font-display)">
          {#if data.spentSoFar}
            You've spent {formatMoney(data.spentSoFar, data.currency)} so far this month.
          {:else}
            Nothing logged yet this month.
          {/if}
        </p>
        <p class="mb-5 mt-1 text-[13px] text-[var(--ink-faint)]">
          Ask Tori a follow-up, or pick a starting point:
        </p>
        <div class="grid gap-1.5 sm:grid-cols-2">
          {#each STARTERS as s}
            <button type="button"
              class="nudge text-left text-[13px]"
              onclick={() => send(s.text)}>
              <Icon name={s.icon} size={15} class="text-[var(--ink-faint)]" />
              <span>{s.text}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#each messages as m}
      <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] rounded-[var(--radius-sm)] px-3.5 py-2.5 text-[13px] leading-relaxed"
          style={m.role === 'user'
            ? 'background:var(--accent);color:var(--accent-contrast)'
            : 'background:var(--paper-sunk);color:var(--ink)'}>
          <p class="whitespace-pre-wrap">{m.content}</p>
          {#each m.charts || [] as c}
            <ChatBarChart title={c.title} bars={c.bars} currency={data.currency} />
          {/each}
        </div>
      </div>
    {/each}

    {#if sending}
      <div class="flex justify-start">
        <div class="max-w-[85%] animate-pulse rounded-[var(--radius-sm)] px-3.5 py-2.5 text-[13px] italic text-[var(--ink-faint)]"
          style="background:var(--paper-sunk)">
          {thinkingLine}…
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <p class="mt-3 text-xs" style="color:var(--negative)">{error}</p>
  {/if}

  <form class="mt-4 flex items-end gap-2 border-t border-[var(--border)] pt-4" onsubmit={(e) => { e.preventDefault(); send(); }}>
    <textarea
      class="input max-h-32 min-h-[42px] flex-1 resize-none !py-2.5"
      rows="1"
      placeholder="Ask Tori about your spending, budgets or trends…"
      bind:value={input}
      onkeydown={onKeydown}
      disabled={sending}
    ></textarea>
    <button class="btn btn-primary grid h-[42px] w-[42px] shrink-0 place-items-center !p-0" disabled={!input.trim() || sending} aria-label="Send">
      <Icon name="send" size={16} />
    </button>
  </form>
</div>
