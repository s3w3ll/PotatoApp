window.App = window.App || {};
// apiBase: your deployed Worker URL (see worker/SETUP.md) enables cross-device sync.
// "" = local-only; the game never touches the network. Set this after the first deploy.
App.config = { apiBase: "https://potato-pet-api.forgesync.workers.dev" };
