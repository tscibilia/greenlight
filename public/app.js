(() => {
  const $ = (sel) => document.querySelector(sel);

  const loadingEl = $('#loading');
  const errorEl = $('#error');
  const mainEl = $('#main');
  const selectorEl = $('#filter-selector');
  const selectEl = $('#filter-select');
  const formEl = $('#add-form');
  const inputEl = $('#domain-input');
  const addBtn = $('#add-btn');
  const statusEl = $('#status');
  const listEl = $('#allowlist');
  const emptyEl = $('#allowlist-empty');

  let filters = [];
  let currentFilterId = null;

  // --- Init ---
  async function init() {
    try {
      const res = await fetch('/api/filters');
      if (!res.ok) throw new Error(`Failed to load filters (${res.status})`);
      filters = await res.json();

      if (!filters.length) {
        throw new Error('No content filters found. Check your UniFi configuration.');
      }

      // Populate filter selector
      if (filters.length > 1) {
        selectorEl.hidden = false;
        selectEl.innerHTML = filters
          .map((f) => {
            const id = f._id || f.id;
            const name = f.name || f.description || id;
            return `<option value="${id}">${name}</option>`;
          })
          .join('');
        selectEl.addEventListener('change', () => {
          currentFilterId = selectEl.value;
          renderAllowlist();
        });
      }

      currentFilterId = filters[0]._id || filters[0].id;
      loadingEl.hidden = true;
      mainEl.hidden = false;
      renderAllowlist();
    } catch (err) {
      loadingEl.hidden = true;
      errorEl.hidden = false;
      errorEl.textContent = err.message;
    }
  }

  // --- Render allowlist ---
  function renderAllowlist() {
    const filter = filters.find(
      (f) => (f._id || f.id) === currentFilterId
    );
    if (!filter) return;

    const allowlistKey = findAllowlistKey(filter);
    const domains = filter[allowlistKey] || [];

    listEl.innerHTML = '';
    emptyEl.hidden = domains.length > 0;

    domains.forEach((domain) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="domain">${escapeHtml(domain)}</span>
        <button data-domain="${escapeHtml(domain)}">Remove</button>
      `;
      li.querySelector('button').addEventListener('click', () => removeDomain(domain));
      listEl.appendChild(li);
    });
  }

  // --- Add domain ---
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = inputEl.value.trim();
    if (!domain) return;

    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';
    hideStatus();

    try {
      const res = await fetch(`/api/filters/${currentFilterId}/allowlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add domain');

      showStatus(data.message, 'success');
      inputEl.value = '';

      // Refresh filter data
      await refreshFilters();
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Unblock';
    }
  });

  // --- Remove domain ---
  async function removeDomain(domain) {
    if (!confirm(`Remove "${domain}" from the allowlist?`)) return;

    hideStatus();

    try {
      const res = await fetch(`/api/filters/${currentFilterId}/allowlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove domain');

      showStatus(data.message, 'success');
      await refreshFilters();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }

  // --- Refresh ---
  async function refreshFilters() {
    try {
      const res = await fetch('/api/filters');
      if (res.ok) {
        filters = await res.json();
        renderAllowlist();
      }
    } catch {
      // silent — stale view is acceptable
    }
  }

  // --- Helpers ---
  function findAllowlistKey(filter) {
    const candidates = [
      'allowedUrls', 'allowed_urls', 'allowlist', 'allowed',
      'whitelistedUrls', 'whitelisted_urls', 'whitelist',
      'excludedUrls', 'excluded_urls',
    ];
    for (const key of candidates) {
      if (Array.isArray(filter[key])) return key;
    }
    for (const [key, value] of Object.entries(filter)) {
      if (Array.isArray(value) && key.toLowerCase().includes('allow')) return key;
    }
    return 'allowedUrls';
  }

  function showStatus(msg, type) {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    setTimeout(hideStatus, 5000);
  }

  function hideStatus() {
    statusEl.hidden = true;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
