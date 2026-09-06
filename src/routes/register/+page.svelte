<script>
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<svelte:head><title>Create account · Budget</title></svelte:head>

<div class="card w-full max-w-sm">
  <div class="mb-6 text-center">
    <div class="text-3xl">💰</div>
    <h1 class="mt-2 text-xl font-bold">Create your account</h1>
    <p class="text-sm text-slate-500">The first account becomes the admin</p>
  </div>

  {#if form?.error}
    <p class="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.error}</p>
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
    <button class="btn-primary w-full">Create account</button>
  </form>

  <p class="mt-4 text-center text-sm text-slate-500">
    Already have an account?
    <a class="font-semibold text-brand-600 hover:underline" href="/login">Sign in</a>
  </p>
</div>
