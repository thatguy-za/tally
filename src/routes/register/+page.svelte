<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  let { form } = $props();
</script>

<svelte:head><title>Create account · Tally</title></svelte:head>

<div class="w-full max-w-sm rise">
  <div class="mb-7 flex flex-col items-center text-center">
    <span class="mb-4 grid h-11 w-11 place-items-center rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)]">
      <Icon name="wallet" size={22} stroke={2} />
    </span>
    <h1 class="text-2xl" style="font-family:var(--font-display)">Create your account</h1>
    <p class="mt-1 text-[13px] text-[var(--ink-faint)]">The first account becomes the admin</p>
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
          autocomplete="new-password" minlength="8" required />
      </div>
      <div>
        <label class="label" for="confirm">Confirm password</label>
        <input class="input" id="confirm" name="confirm" type="password"
          autocomplete="new-password" minlength="8" required />
      </div>
      <button class="btn btn-primary w-full">Create account</button>
    </form>
  </div>

  <p class="mt-4 text-center text-[13px] text-[var(--ink-faint)]">
    Already have an account? <a class="link-accent" href="/login">Sign in</a>
  </p>
</div>
