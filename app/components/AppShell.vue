<script setup lang="ts">
const props = defineProps<{ panel: boolean }>()

const ui = useUi()
</script>

<template>
  <div
    class="shell"
    :class="{ 'nav-open': ui.navOpen, 'panel-open': ui.panelOpen && props.panel, 'no-panel': !props.panel }"
  >
    <aside class="rail">
      <slot name="rail" />
    </aside>
    <aside class="sidebar">
      <slot name="sidebar" />
    </aside>
    <main class="main">
      <slot />
    </main>
    <aside class="panel">
      <slot name="panel" />
    </aside>
    <div class="scrim" @click="ui.navOpen = false; ui.panelOpen = false" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr) var(--panel-w);
  position: fixed;
  inset: 0;
  overflow: hidden;
}
/* viewport-fit=cover: keep content clear of the notch / home indicator */
.rail,
.sidebar,
.main,
.panel {
  padding-top: env(safe-area-inset-top);
}
.rail,
.sidebar,
.panel {
  padding-bottom: env(safe-area-inset-bottom);
}
.rail {
  background: var(--bg-rail);
  overflow: hidden;
}
.sidebar {
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.main {
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.panel {
  background: var(--bg-sidebar);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.scrim {
  display: none;
}

/* Hide the AI panel by default on mid-width screens, toggle from the header */
@media (max-width: 1100px) {
  .shell {
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr);
  }
  .panel {
    display: none;
  }
  .shell.panel-open {
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr) var(--panel-w);
  }
  .shell.panel-open .panel {
    display: flex;
  }
}

/* Mobile: rail + sidebar become a left drawer, panel a right drawer */
@media (max-width: 768px) {
  .shell,
  .shell.panel-open {
    grid-template-columns: minmax(0, 1fr);
  }
  .main {
    grid-column: 1;
    grid-row: 1;
  }
  .rail,
  .sidebar,
  .panel,
  .shell.panel-open .panel {
    display: flex;
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 30;
    transition: transform 0.2s ease;
  }
  .rail {
    left: 0;
    width: var(--rail-w);
    transform: translateX(calc(-1 * (var(--rail-w) + var(--sidebar-w))));
  }
  .sidebar {
    left: var(--rail-w);
    width: min(var(--sidebar-w), calc(100vw - var(--rail-w) - 48px));
    transform: translateX(calc(-1 * (var(--rail-w) + var(--sidebar-w))));
  }
  .panel {
    right: 0;
    width: min(var(--panel-w), calc(100vw - 48px));
    transform: translateX(100%);
  }
  .nav-open .rail,
  .nav-open .sidebar,
  .panel-open .panel {
    transform: none;
  }
  .nav-open .scrim,
  .panel-open .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgba(0, 0, 0, 0.5);
  }
}

/* The panel describes a project, so the explore view takes its column */
.shell.no-panel .panel {
  display: none;
}
@media (min-width: 769px) {
  .shell.no-panel {
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr);
  }
}
</style>
