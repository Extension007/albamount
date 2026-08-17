(function () {
  var toggle = document.getElementById('siteIntroDismiss');
  if (!toggle) return;

  function persist() {
    document.cookie = 'albamount_intro=1; path=/; SameSite=Lax';
  }

  if (toggle.checked) persist();
  toggle.addEventListener('change', persist);
})();
