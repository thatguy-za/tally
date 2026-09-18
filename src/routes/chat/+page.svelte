<script>
  import Icon from '$lib/components/Icon.svelte';
  import ChatBarChart from '$lib/components/ChatBarChart.svelte';
  let { data } = $props();

  const STARTERS = [
    'How much did I spend on groceries this month?',
    'Chart my spending by category this month',
    'Am I over budget on anything right now?',
    'How does this month compare to my usual?'
  ];

  let messages = $state([]); // { role: 'user'|'assistant', content: string, charts?: object[] }
  let input = $state('');
  let sending = $state(false);
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

<svelte:head><title>Ask · Tally</title></svelte:head>

<div class="mb-7 rise">
  <p class="kicker mb-2">Ask</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Chat with your data</h1>
</div>

<div class="card flex h-[65vh] min-h-[420px] flex-col rise rise-1">
  <div bind:this={listEl} class="flex-1 space-y-4 overflow-y-auto pr-1">
    {#if !messages.length}
      <div class="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span class="grid h-11 w-11 place-items-center rounded-full" style="background:var(--paper-sunk)">
          <Icon name="sparkle" size={18} class="text-[var(--accent)]" />
        </span>
        <p class="max-w-xs text-[13px] text-[var(--ink-faint)]">
          Ask about your spending, budgets or trends — I'll look it up rather than guess.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          {#each STARTERS as s}
            <button type="button" class="chip text-[12px]" onclick={() => send(s)}>{s}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#each messages as m}
      <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed"
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
        <div class="max-w-[85%] rounded-[12px] px-3.5 py-2.5" style="background:var(--paper-sunk)">
          <div class="flex gap-1">
            <span class="ai-shimmer h-2 w-2 rounded-full"></span>
            <span class="ai-shimmer h-2 w-2 rounded-full"></span>
            <span class="ai-shimmer h-2 w-2 rounded-full"></span>
          </div>
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
      placeholder="Ask about your spending, budgets or trends…"
      bind:value={input}
      onkeydown={onKeydown}
      disabled={sending}
    ></textarea>
    <button class="btn btn-primary grid h-[42px] w-[42px] shrink-0 place-items-center !p-0" disabled={!input.trim() || sending} aria-label="Send">
      <Icon name="send" size={16} />
    </button>
  </form>
</div>
