<script>
  const COLORS = ['#16a34a', '#f97316', '#6366f1', '#eab308', '#ec4899', '#0ea5e9'];
  const pieces = Array.from({ length: 70 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    duration: 2.2 + Math.random() * 1.3,
    width: 6 + Math.random() * 6,
    height: 4 + Math.random() * 5,
    color: COLORS[i % COLORS.length],
    rotate: Math.round(Math.random() * 360),
    drift: Math.round((Math.random() - 0.5) * 160)
  }));
</script>

<div class="confetti" aria-hidden="true">
  {#each pieces as p (p.id)}
    <span
      class="piece"
      style="left:{p.left}%; animation-delay:{p.delay}s; animation-duration:{p.duration}s;
        width:{p.width}px; height:{p.height}px; background:{p.color};
        --drift:{p.drift}px; --rotate:{p.rotate}deg"
    ></span>
  {/each}
</div>

<style>
  .confetti {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 100;
  }
  .piece {
    position: absolute;
    top: -10px;
    opacity: 0.9;
    border-radius: 1px;
    animation-name: confetti-fall;
    animation-timing-function: cubic-bezier(0.25, 0.1, 0.4, 1);
    animation-fill-mode: forwards;
  }
  @keyframes confetti-fall {
    to {
      transform: translate(var(--drift), 110vh) rotate(var(--rotate));
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti { display: none; }
  }
</style>
