// Emerald Rupture (pokeemerald-expansion 1.17) .sav reader: party + all 14 PC boxes.
// Tables (species/move/item ids, abilities, growth rates) come from js/save_constants/rupture.js,
// which is generated from the game's own source by tools/gen5/calc_export.py.
(function () {
    const SECTION = 4096, DATA_SIZE = 0xFF4, SLOT_B = 0xE000;
    const SB1_PARTY_COUNT = 0x234, SB1_PARTY = 0x238, MON_SIZE = 80, PARTY_MON_SIZE = 100;
    const BOX_COUNT = 14, BOX_SLOTS = 30;
    const NATURES = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax",
        "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle",
        "Sassy", "Careful", "Quirky"];
    const ORDERS = [[1, 2, 3, 4], [1, 2, 4, 3], [1, 3, 2, 4], [1, 3, 4, 2], [1, 4, 2, 3], [1, 4, 3, 2],
        [2, 1, 3, 4], [2, 1, 4, 3], [2, 3, 1, 4], [2, 3, 4, 1], [2, 4, 1, 3], [2, 4, 3, 1],
        [3, 1, 2, 4], [3, 1, 4, 2], [3, 2, 1, 4], [3, 2, 4, 1], [3, 4, 1, 2], [3, 4, 2, 1],
        [4, 1, 2, 3], [4, 1, 3, 2], [4, 2, 1, 3], [4, 2, 3, 1], [4, 3, 1, 2], [4, 3, 2, 1]];

    // experience needed for level n; growth index: 0 medium fast, 1 erratic, 2 fluctuating, 3 medium slow, 4 fast, 5 slow
    function expAt(g, n) {
        const c = n * n * n;
        switch (g) {
            case 1:
                if (n <= 50) return Math.floor(c * (100 - n) / 50);
                if (n <= 68) return Math.floor(c * (150 - n) / 100);
                if (n <= 98) return Math.floor(c * Math.floor((1911 - 10 * n) / 3) / 500);
                return Math.floor(c * (160 - n) / 100);
            case 2:
                if (n <= 15) return Math.floor(c * (Math.floor((n + 1) / 3) + 24) / 50);
                if (n <= 35) return Math.floor(c * (n + 14) / 50);
                return Math.floor(c * (Math.floor(n / 2) + 32) / 50);
            case 3: return Math.max(0, Math.floor(6 * c / 5) - 15 * n * n + 100 * n - 140);
            case 4: return Math.floor(4 * c / 5);
            case 5: return Math.floor(5 * c / 4);
            default: return c;
        }
    }
    function levelFromExp(g, exp) {
        let lvl = 1;
        for (let n = 2; n <= 100; n++) { if (expAt(g, n) <= exp) lvl = n; else break; }
        return lvl;
    }

    // Reassemble the newest save slot into one buffer per save block (sections are stored rotated).
    function readSlot(dv) {
        function slot(base) {
            const secs = {};
            let index = -1;
            for (let i = 0; i < 14; i++) {
                const o = base + i * SECTION;
                if (o + SECTION > dv.byteLength) return null;
                const id = dv.getUint16(o + 0xFF4, true), sig = dv.getUint32(o + 0xFF8, true);
                if (sig !== 0x08012025 || id > 13) continue;
                secs[id] = o;
                index = Math.max(index, dv.getUint32(o + 0xFFC, true));
            }
            return Object.keys(secs).length ? { secs, index } : null;
        }
        const a = slot(0), b = slot(SLOT_B);
        if (!a && !b) return null;
        return (!a || (b && b.index > a.index)) ? b : a;
    }

    function joinSections(dv, secs, ids, sizes) {
        const out = new Uint8Array(ids.reduce((n, id) => n + sizes[id], 0));
        let p = 0;
        for (const id of ids) {
            if (secs[id] !== undefined) out.set(new Uint8Array(dv.buffer, dv.byteOffset + secs[id], sizes[id]), p);
            p += sizes[id];
        }
        return new DataView(out.buffer);
    }

    function decodeMon(d, off, partyLevel) {
        const T = ruptureTables;
        const pid = d.getUint32(off, true), tid = d.getUint32(off + 4, true);
        const b18 = d.getUint8(off + 18), b19 = d.getUint8(off + 19);
        if ((b19 & 1) || !(b19 & 2) || (b19 & 4)) return null; // bad egg / no species / egg
        const key = (pid ^ tid) >>> 0;
        const w = [];
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const v = (d.getUint32(off + 32 + 4 * i, true) ^ key) >>> 0;
            w.push(v);
            sum = (sum + (v & 0xFFFF) + (v >>> 16)) & 0xFFFF;
        }
        if (sum !== d.getUint16(off + 28, true)) return null; // checksum mismatch: not a real Pokemon
        const order = ORDERS[pid % 24];
        const sub = n => order.indexOf(n) * 3;
        const g = sub(1), m = sub(2), e = sub(3), x = sub(4);
        const speciesId = w[g] & 0x7FF;
        const name = T.mons[speciesId];
        if (!name) return null;
        const itemId = (w[g] >>> 16) & 0x3FF;
        const exp = w[g + 1] & 0x1FFFFF;
        const sp = T.species[name] || { ab: [], gr: 0 };
        const level = partyLevel || levelFromExp(sp.gr, exp);
        const moves = [w[m] & 0x7FF, (w[m] >>> 16) & 0x7FF, w[m + 1] & 0x7FF, (w[m + 1] >>> 16) & 0x7FF]
            .filter(id => id).map(id => T.moves[id]).filter(Boolean);
        const iv = w[x + 1];
        const ivs = [0, 5, 10, 15, 20, 25].map(s => (iv >>> s) & 31); // HP Atk Def Spe SpA SpD
        const evs = [0, 8, 16, 24].map(s => (w[e] >>> s) & 255).concat([0, 8].map(s => (w[e + 1] >>> s) & 255));
        const slot = (w[x + 2] >>> 29) & 3;
        const ab = sp.ab[slot] || sp.ab[0] || "";
        const nature = NATURES[((pid % 25) ^ (b18 >> 3)) % 25];
        return { name, level, nature, ivs, evs, ability: ab, item: T.items[itemId] || "", moves };
    }

    function toShowdown(mon, evsOn) {
        const L = ["HP", "Atk", "Def", "Spe", "SpA", "SpD"];
        const order = [0, 1, 2, 4, 5, 3]; // HP Atk Def SpA SpD Spe
        let t = mon.name + (mon.item ? ` @ ${mon.item}` : "") + "\n";
        t += `Level: ${mon.level}\n${mon.nature} Nature\n`;
        if (evsOn && mon.evs.some(v => v > 0)) t += "EVs: " + order.map(i => `${mon.evs[i]} ${L[i]}`).join(" / ") + "\n";
        t += "IVs: " + order.map(i => `${mon.ivs[i]} ${L[i]}`).join(" / ") + "\n";
        if (mon.ability) t += `Ability: ${mon.ability}\n`;
        mon.moves.forEach(mv => { t += `- ${mv}\n`; });
        return t + "\n";
    }

    window.readRuptureSave = function (buffer, evsOn) {
        const dv = new DataView(buffer);
        const s = readSlot(dv);
        if (!s) throw new Error("This doesn't look like a Pokemon Emerald save (no valid save slot found).");
        const sizes = {};
        for (let i = 0; i < 14; i++) sizes[i] = i === 13 ? 2000 : 0xF80;
        const sb1 = joinSections(dv, s.secs, [1, 2, 3, 4], sizes);
        const pc = joinSections(dv, s.secs, [5, 6, 7, 8, 9, 10, 11, 12, 13], sizes);
        const out = { party: [], boxes: [] };
        const count = Math.min(sb1.getUint32(SB1_PARTY_COUNT, true), 6);
        for (let i = 0; i < count; i++) {
            const o = SB1_PARTY + i * PARTY_MON_SIZE;
            const mon = decodeMon(sb1, o, sb1.getUint8(o + 84));
            if (mon) out.party.push(mon);
        }
        for (let b = 0; b < BOX_COUNT; b++) {
            const box = [];
            for (let i = 0; i < BOX_SLOTS; i++) {
                const mon = decodeMon(pc, 4 + (b * BOX_SLOTS + i) * MON_SIZE, 0);
                if (mon) box.push(mon);
            }
            out.boxes.push(box);
        }
        out.text = out.party.map(m => toShowdown(m, evsOn)).join("") +
            out.boxes.map(bx => bx.map(m => toShowdown(m, evsOn)).join("")).join("");
        out.total = out.party.length + out.boxes.reduce((n, bx) => n + bx.length, 0);
        return out;
    };

    function bind() {
        $(document).off('change.rupture').on('change.rupture', '#save-upload-rupture', function (event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                let msg;
                try {
                    const res = window.readRuptureSave(e.target.result, typeof hasEvs === 'undefined' ? true : hasEvs);
                    $('.import-team-text').val(res.text);
                    $('#import').click();
                    msg = `${file.name} loaded: ${res.party.length} in party, ${res.total - res.party.length} in boxes`;
                } catch (err) {
                    console.log(err);
                    msg = `Couldn't read ${file.name}: ${err.message}`;
                }
                if ($('#changelog').length == 0) $('#clearSets').after("<p id='changelog'></p>");
                $('#changelog').html(`<h4>Save:</h4><p>${msg}</p>`).show();
            };
            reader.readAsArrayBuffer(file);
        });
        $(document).on('click.rupture', '#read-save', function () {
            const el = $('#save-upload-rupture')[0];
            if (el) el.value = null;
        });
    }
    bind();
})();
