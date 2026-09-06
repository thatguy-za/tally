<script>
  import { navigating } from '$app/stores';

  let visible = $state(false);
  let progress = $state(0);
  let timer;

  $effect(() => {
    if ($navigating) {
      visible = true;
      progress = 0.08;
      clearInterval(timer);
      timer = setInterval(() => {
        progress = Math.min(0.9, progress + (0.9 - progress) * 0.18);
      }, 120);
    } else if (visible) {
      clearInterval(timer);
      progress = 1;
      setTimeout(() => {
        visible = false;
        progress = 0;
      }, 220);
    }
    return () => clearInterval(timer);
  });
</script>

{#if visible}
  <div
    class="loadbar"
    style="transform: scaleX({progress}); transition: transform {progress === 1 ? 0.2 : 0.3}s ease, opacity 0.2s; opacity: {progress === 1 ? 0 : 1}"
  ></div>
{/if}
