/* Wipe Clock: progress calculator. Pure functions, plus page wiring when loaded in a browser. */
(function (root) {
  'use strict';

  var DAY_MS = 86400000;

  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/[\s,_']/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  // Whole calendar days from the local day of `now` to the local day of `wipe`, the wipe day excluded.
  function daysLeft(now, wipe) {
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var b = new Date(wipe.getFullYear(), wipe.getMonth(), wipe.getDate());
    return Math.round((b - a) / DAY_MS);
  }

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1) return null;
    return d;
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // Shared ending: given hours still needed, compare with the time left before the wipe.
  function finish(hoursNeeded, input, out) {
    var hpd = num(input.hoursPerDay);
    if (!(hpd > 0 && hpd <= 24)) return { error: 'hoursPerDay' };
    var now = input.now || new Date();
    var noDate = String(input.wipeDay || '').trim() === '';
    var wipe = parseDay(input.wipeDay);
    if (!wipe && !noDate) return { error: 'wipeDay' };
    var playDays = Math.max(Math.ceil(hoursNeeded / hpd - 1e-9), 0);
    out.hours = hoursNeeded;
    out.playDays = playDays;
    // Today counts as the first play day.
    out.reachDay = playDays === 0 ? addDays(now, 0) : addDays(now, playDays - 1);
    // The wipe date is optional: without one there is nothing to compare against.
    if (noDate) {
      out.noWipeDay = true;
      return out;
    }
    var left = daysLeft(now, wipe);
    out.daysLeft = Math.max(left, 0);
    out.hoursAvailable = Math.max(left, 0) * hpd;
    out.beforeWipe = left > 0 && playDays <= left;
    out.hoursPerDayNeeded = left > 0 ? hoursNeeded / left : null;
    return out;
  }

  // Mode 1: from XP numbers read in the game.
  function byXp(input) {
    var cur = num(input.currentXp), target = num(input.targetXp);
    var perMatch = num(input.xpPerMatch), minutes = num(input.matchMinutes);
    if (!(cur >= 0)) return { error: 'currentXp' };
    if (!(target >= 0)) return { error: 'targetXp' };
    if (!(perMatch > 0)) return { error: 'xpPerMatch' };
    if (!(minutes > 0 && minutes <= 600)) return { error: 'matchMinutes' };
    var xpLeft = Math.max(target - cur, 0);
    var matches = Math.max(Math.ceil(xpLeft / perMatch - 1e-9), 0);
    return finish(matches * minutes / 60, input, { xpLeft: xpLeft, matches: matches });
  }

  // Mode 2: from your own pace ("I am 55% there after 40 hours").
  function byPace(input) {
    var played = num(input.hoursPlayed), pct = num(input.percentDone);
    if (!(played > 0)) return { error: 'hoursPlayed' };
    if (!(pct > 0 && pct <= 100)) return { error: 'percentDone' };
    var remaining = played * (100 - pct) / pct;
    return finish(remaining, input, { totalHours: played * 100 / pct });
  }

  function fmtHours(h) {
    if (h < 1) return Math.round(h * 60) + ' min';
    return (Math.round(h * 10) / 10).toLocaleString('en-US') + ' h';
  }

  function fmtDay(d) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  var MESSAGES = {
    currentXp: 'Enter your current XP as a number.',
    targetXp: 'Enter the XP you need to reach.',
    xpPerMatch: 'Enter the XP you earn in one match (more than zero).',
    matchMinutes: 'Enter how many minutes one match lasts.',
    hoursPlayed: 'Enter the hours you have already put toward this unlock.',
    percentDone: 'Enter how far you are, from 1 to 100 percent.',
    hoursPerDay: 'Enter how many hours you play per day, up to 24.',
    wipeDay: 'Enter the wipe date as YYYY-MM-DD.'
  };

  // Plain-text lines describing a result, used by the page and by the tests.
  function describe(r) {
    if (r.error) return [MESSAGES[r.error]];
    var lines = [];
    if (r.matches !== undefined) {
      lines.push(r.xpLeft.toLocaleString('en-US') + ' XP left, about ' + r.matches + ' matches.');
    }
    if (r.totalHours !== undefined) {
      lines.push('At your pace the whole unlock takes about ' + fmtHours(r.totalHours) + '.');
    }
    lines.push('Time still needed: ' + fmtHours(r.hours) + ', about ' + r.playDays + ' play days, done around ' +
      fmtDay(r.reachDay) + '.');
    if (r.noWipeDay) {
      lines.push('No wipe date entered, so there is nothing to compare with. Add one when a wipe is announced.');
    } else if (r.daysLeft <= 0) {
      lines.push('The wipe date you entered is today or past, so there is nothing to compare with.');
    } else if (r.beforeWipe) {
      lines.push('You make it before the wipe, with ' + fmtHours(r.hoursAvailable - r.hours) + ' to spare.');
    } else {
      lines.push('Not before the wipe at this rate: ' + r.daysLeft + ' days left give you ' +
        fmtHours(r.hoursAvailable) + '. You would need ' + fmtHours(r.hoursPerDayNeeded) + ' per day.');
    }
    return lines;
  }

  var api = { num: num, daysLeft: daysLeft, parseDay: parseDay, byXp: byXp, byPace: byPace, describe: describe,
    fmtHours: fmtHours, fmtDay: fmtDay };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WipeClock = api;

  if (typeof document === 'undefined') return;

  function val(form, name) { return form.elements[name] ? form.elements[name].value : ''; }

  function render(el, lines, isError) {
    el.textContent = '';
    lines.forEach(function (t) {
      var p = document.createElement('p');
      p.textContent = t;
      el.appendChild(p);
    });
    el.className = isError ? 'result error' : 'result';
  }

  function wire(formId, fn, fields) {
    var form = document.getElementById(formId);
    if (!form) return;
    var out = form.querySelector('.result');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = {};
      fields.concat(['hoursPerDay', 'wipeDay']).forEach(function (f) { input[f] = val(form, f); });
      var r = fn(input);
      render(out, describe(r), !!r.error);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire('by-xp', byXp, ['currentXp', 'targetXp', 'xpPerMatch', 'matchMinutes']);
    wire('by-pace', byPace, ['hoursPlayed', 'percentDone']);
  });
})(typeof window !== 'undefined' ? window : this);
