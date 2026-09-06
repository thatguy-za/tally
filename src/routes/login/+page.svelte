<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  let { form, data } = $props();
</script>

<svelte:head><title>Sign in · Tally</title></svelte:head>

<div class="w-full max-w-sm rise">
  <div class="mb-7 flex flex-col items-center text-center">
    <span class="mb-4 grid h-11 w-11 place-items-center rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)]">
      <Icon name="wallet" size={22} stroke={2} />
    </span>
    <h1 class="text-2xl" style="font-family:var(--font-display)">Welcome back</h1>
    <p class="mt-1 text-[13px] text-[var(--ink-faint)]">Sign in to Tally</p>
  </div>

  <div class="card">
    {#if form?.error}
      <p class="mb-4 rounded-[9px] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
    {/if}

    <form method="POST" use:enhance class="space-y-4">
      <div>
        <label class="label" for="email">Email</label>
        <input class="input" id="email" name="email" type="email" autocomplete="email"
          value={form?.email ?? ''} required />
      </div>
      <div>
        <label class="label" for="password">Password</label>
        <input class="input" id="password" name="password" type="password"
          autocomplete="current-password" required />
      </div>
      <button class="btn btn-primary w-full">Sign in</button>
    </form>
  </div>

  {#if data.allowRegistration}
    <p class="mt-4 text-center text-[13px] text-[var(--ink-faint)]">
      No account? <a class="link-accent" href="/register">Create one</a>
    </p>
  {/if}
</div>
