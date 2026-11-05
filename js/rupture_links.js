// Emerald Rupture docs site: index.html?...&opp=<set id> opens the calc with that trainer Pokemon on the right.
(function () {
    var opp = new URLSearchParams(location.search).get('opp');
    if (!opp) return;
    try { localStorage["right"] = opp; } catch (e) {}
    var tries = 0;
    var t = setInterval(function () {
        tries++;
        if (tries > 150) { clearInterval(t); return; }
        if (typeof setdex === 'undefined' || !setdex || typeof setOpposing !== 'function') return;
        var sp = opp.split(' (')[0];
        if (!setdex[sp]) return;
        clearInterval(t);
        setTimeout(function () { setOpposing(opp); }, 400);
    }, 100);
})();
