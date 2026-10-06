/* Independent of the application bundle, so a failed module can still show help. */
(function () {
  var root = document.getElementById('root');
  if (!root) return;

  var mounted = false;
  var emptyTimer = null;
  var loadingTimer = null;

  function hasApp() {
    return !!root.querySelector('.app-shell,.survival-game-page,.arcade-page,.factor-game');
  }

  function hasRecovery() {
    return !!root.querySelector('[data-startup-recovery]');
  }

  function clearTimers() {
    window.clearTimeout(emptyTimer);
    window.clearTimeout(loadingTimer);
    emptyTimer = null;
    loadingTimer = null;
  }

  function showRecovery() {
    if (hasApp() || hasRecovery()) return;
    clearTimers();
    var panel = document.createElement('main');
    panel.className = 'startup-recovery-shell';
    panel.setAttribute('data-startup-recovery', '');
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-labelledby', 'startup-recovery-title');
    var card = document.createElement('div');
    card.className = 'startup-recovery-card';
    var brand = document.createElement('div');
    brand.className = 'startup-recovery-brand';
    brand.textContent = '🍉 西瓜网球度假酒店';
    var heading = document.createElement('h1');
    heading.id = 'startup-recovery-title';
    heading.textContent = '页面没有完成加载';
    var description = document.createElement('p');
    description.textContent = '工作台暂时无法显示，请重新加载此页。已保存的方案不会被删除。';
    var reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '重新加载此页';
    reload.addEventListener('click', function () { window.location.reload(); });
    card.append(brand, heading, description, reload);
    panel.appendChild(card);
    root.replaceChildren(panel);
  }

  function inspectRoot() {
    if (hasApp()) {
      mounted = true;
      clearTimers();
      return;
    }
    if (hasRecovery()) {
      clearTimers();
      return;
    }
    if (mounted && !root.hasChildNodes() && emptyTimer === null) {
      // Give a hot update or a synchronous React replacement time to remount.
      emptyTimer = window.setTimeout(function () {
        emptyTimer = null;
        if (!hasApp() && !hasRecovery() && !root.hasChildNodes()) showRecovery();
      }, 120);
    }
  }

  function onStartupError() {
    // Errors from normal, already mounted app operations must not replace its UI.
    if (hasApp() || hasRecovery()) return;
    if (emptyTimer !== null) return;
    emptyTimer = window.setTimeout(function () {
      emptyTimer = null;
      if (!hasApp() && !hasRecovery()) showRecovery();
    }, 120);
  }

  loadingTimer = window.setTimeout(showRecovery, 10000);
  new MutationObserver(inspectRoot).observe(root, { childList: true, subtree: true });
  window.addEventListener('error', onStartupError, true);
  window.addEventListener('unhandledrejection', onStartupError);
  inspectRoot();
}());
