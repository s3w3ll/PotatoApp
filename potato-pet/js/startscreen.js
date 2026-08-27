window.App = window.App || {};
App.startscreen = (function () {
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  function randomCode() {
    let s = "";
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s.slice(0, 3) + "-" + s.slice(3);
  }

  async function render(container, { onReady }) {
    const saves = await App.save.list();
    if (saves.length === 0) return startCreation(container, onReady);

    container.innerHTML =
      '<h1>Potato Pet</h1><h2>Who\'s playing?</h2>' +
      '<div class="cards">' + saves.map(s =>
        '<button class="card" data-code="' + s.code + '">' +
        (s.name || "(unnamed)") + '<br><small>' + s.species + ' · ' + s.code + '</small></button>'
      ).join("") + '</div>' +
      '<p><input id="codein" placeholder="ABC-DEF" maxlength="7"> ' +
      '<button id="entercode">Enter a code</button></p>' +
      '<p><button id="makenew">Make a new pet</button></p>' +
      '<p><a href="tests.html">(logic tests)</a></p>';

    container.querySelectorAll(".card").forEach(b => b.addEventListener("click", async () => {
      const world = await safeLoad(b.dataset.code);
      if (world) onReady(world);
    }));
    container.querySelector("#entercode").addEventListener("click", async () => {
      const code = container.querySelector("#codein").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(code)) return alert("That code doesn't look right.");
      const norm = code.length === 6 ? code.slice(0,3) + "-" + code.slice(3) : code;
      let world = await safeLoad(norm);
      if (!world) {
        const fresh = App.world.generateWorld(norm); fresh.pet.name = "Friend";
        const res = await App.save.create(fresh);
        if (res.ok) {
          world = fresh;
        } else {
          try { world = await App.save.load(norm); } catch (_) { world = null; }  // server had it after all
          if (!world) { alert("That code is in use on another device and we couldn't reach it. Try again in a moment."); return; }
        }
      }
      onReady(world);
    });
    container.querySelector("#makenew").addEventListener("click", () => startCreation(container, onReady));
  }

  async function safeLoad(code) {
    try { return await App.save.load(code); }
    catch (e) {
      if (String(e.message).includes("SAVE_CORRUPT")) {
        if (confirm("We couldn't read that pet. Start a fresh one for this code?")) {
          await App.save.remove(code);                 // discard the unreadable local copy
          let recovered = null;
          try { recovered = await App.save.load(code); } catch (_) { recovered = null; }
          if (recovered) return recovered;             // the server still had it
          const w = App.world.generateWorld(code); w.pet.name = "Friend";
          const res = await App.save.create(w);
          if (!res.ok) { alert("Couldn't set that up right now — please try again."); return null; }
          return w;
        }
        return null;
      }
      throw e;
    }
  }

  function startCreation(container, onReady, seedCode) {
    let code = seedCode || randomCode();
    function paint() {
      const preview = App.world.generateWorld(code);
      const m = App.sprites.manifest[preview.pet.species] || {};
      const S = 3;
      const bg = m.sheet
        ? 'background-image:url(' + m.sheet(App.sprites.variantFor(preview.pet.tint)) +
          ');background-size:' + (m.cols * m.cell * S) + 'px ' + (m.rows * m.cell * S) +
          'px;background-position:0 0'
        : 'background:' + (m.placeholderColor || "#999") + ';filter:hue-rotate(' + (preview.pet.tint || 0) + 'deg)';
      container.innerHTML =
        '<h1>Meet your new pet!</h1>' +
        '<div class="preview pixel" id="pvpet" style="' + bg + '"></div>' +
        '<p>' + preview.pet.species + ' in a ' + preview.room.theme + ' room</p>' +
        '<p><strong>' + code + '</strong></p>' +
        '<p><button id="reroll">Reroll</button> <button id="keep">Keep this one</button></p>';
      if (m.sheet) {
        const probe = new Image();
        probe.onerror = () => {
          const d = container.querySelector("#pvpet");
          if (d) {
            d.classList.add("fallback");
            d.style.backgroundImage = "none";
            d.style.background = (m.placeholderColor || "#999");
            d.style.filter = "hue-rotate(" + (preview.pet.tint || 0) + "deg)";
          }
        };
        probe.src = m.sheet(App.sprites.variantFor(preview.pet.tint));
      }
      container.querySelector("#reroll").addEventListener("click", () => { code = randomCode(); paint(); });
      container.querySelector("#keep").addEventListener("click", () => nameStep(container, code, onReady));
    }
    paint();
  }

  function nameStep(container, code, onReady) {
    container.innerHTML =
      '<h1>Name your pet</h1>' +
      '<p><input id="name" maxlength="16" placeholder="Type a name"></p>' +
      '<p id="nameerr" class="err" hidden></p>' +
      '<p><button id="confirm">That\'s the one!</button></p>';
    container.querySelector("#confirm").addEventListener("click", async () => {
      const res = App.content.validateName(container.querySelector("#name").value);
      const err = container.querySelector("#nameerr");
      if (!res.ok) {
        err.hidden = false;
        err.textContent = res.reason === "length"
          ? "Please use 1 to 16 letters." : "Let's pick a kinder name.";
        return;
      }
      const world = App.world.generateWorld(code);
      world.pet.name = res.value;
      const result = await App.save.create(world);
      if (!result.ok && result.reason === "code-taken") {
        const fresh = randomCode();
        container.innerHTML =
          '<h1>Almost!</h1>' +
          '<p>That code was already taken — here\'s a new one.</p>' +
          '<p><strong>' + fresh + '</strong></p>' +
          '<p><button id="again">OK</button></p>';
        container.querySelector("#again").addEventListener("click",
          () => startCreation(container, onReady, fresh));
        return;
      }
      container.innerHTML =
        '<h1>All set!</h1><p>Your pet\'s code is:</p>' +
        '<p class="bigcode">' + code + '</p>' +
        '<p><strong>Write this down!</strong> You\'ll need it to visit ' + res.value + ' on another device later.</p>' +
        '<p><button id="go">Play</button></p>';
      container.querySelector("#go").addEventListener("click", () => onReady(world));
    });
  }

  return { ALPHABET, randomCode, render };
})();
