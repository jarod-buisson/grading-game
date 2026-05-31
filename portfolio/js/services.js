/* Configurateur de la page Services.
   Met à jour le récapitulatif et l'estimation tarifaire en direct.
   Tarifs de maquette — purement indicatifs.
   Prix unitaire = base(type) + rendu + scan, avec supplément format 120. */
(function () {
  var form = document.getElementById('configForm');
  if (!form) return;

  var FORMAT_SURCHARGE = { '35mm': 0, '120': 3 }; // supplément moyen format / pellicule

  var qtyInput = document.getElementById('qty');
  var formatSel = document.getElementById('format');

  function checked(name) {
    return form.querySelector('input[name="' + name + '"]:checked');
  }

  function update() {
    var type   = checked('type');
    var rendu  = checked('rendu');
    var scan   = checked('scan');
    var format = formatSel.value;
    var qty    = Math.max(1, parseInt(qtyInput.value, 10) || 1);

    var unit =
      Number(type.dataset.price) +
      Number(rendu.dataset.price) +
      Number(scan.dataset.price) +
      (FORMAT_SURCHARGE[format] || 0);

    var total = unit * qty;

    // Récap texte
    set('r-type',   type.value);
    set('r-rendu',  rendu.value);
    set('r-scan',   scan.value);
    set('r-format', format === '120' ? '120 (moyen format)' : '35 mm');
    set('r-qty',    qty + (qty > 1 ? ' pellicules' : ' pellicule'));
    set('r-unit',   unit + ' €');
    set('r-total',  total + ' €');

    // état visuel des cartes (la bordure colorée est gérée en CSS via :checked)
  }

  function set(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // Stepper quantité
  document.getElementById('plus').addEventListener('click', function () {
    qtyInput.value = Math.min(99, (parseInt(qtyInput.value, 10) || 1) + 1);
    update();
  });
  document.getElementById('minus').addEventListener('click', function () {
    qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
    update();
  });

  // Réagit à tout changement d'option
  form.addEventListener('change', update);

  // Soumission (maquette : pas d'envoi réel)
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('sentMsg');
    if (msg) {
      msg.classList.add('show');
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  update();
})();
