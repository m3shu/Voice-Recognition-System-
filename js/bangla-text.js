/*
 * bangla-text.js
 * Post-processing for Bangla dictation: spoken punctuation ("দাঁড়ি" -> "।"),
 * control commands ("থামো"), Bangla digits and text helpers.
 *
 * Works in the browser (window.BanglaText) and in Node (require) for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BanglaText = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const PUNCT_CLASS = '।,?!;:';

  // Spoken anywhere in a sentence, replaced inline.
  const PUNCTUATION = [
    { say: ['দাঁড়ি', 'দাড়ি', 'পূর্ণচ্ছেদ', 'ফুলস্টপ', 'full stop'], insert: '।', name: 'দাঁড়ি' },
    { say: ['কমা', 'comma'], insert: ',', name: 'কমা' },
    { say: ['প্রশ্নবোধক চিহ্ন', 'প্রশ্নচিহ্ন', 'প্রশ্ন চিহ্ন', 'question mark'], insert: '?', name: 'প্রশ্নবোধক চিহ্ন' },
    { say: ['বিস্ময়সূচক চিহ্ন', 'বিস্ময়চিহ্ন', 'বিস্ময় চিহ্ন', 'আশ্চর্যবোধক চিহ্ন', 'exclamation mark'], insert: '!', name: 'বিস্ময়সূচক চিহ্ন' },
    { say: ['সেমিকোলন', 'semicolon'], insert: ';', name: 'সেমিকোলন' },
    { say: ['কোলন', 'colon'], insert: ':', name: 'কোলন' },
  ];

  const BREAKS = [
    { say: ['নতুন অনুচ্ছেদ', 'নতুন প্যারা', 'new paragraph'], insert: '\n\n', name: 'নতুন অনুচ্ছেদ' },
    { say: ['নতুন লাইন', 'new line'], insert: '\n', name: 'নতুন লাইন' },
  ];

  // Only trigger when the whole utterance is the command, so normal
  // sentences that happen to contain these words are left alone.
  const CONTROLS = [
    { say: ['থামো', 'থামুন', 'বন্ধ করো', 'বন্ধ করুন', 'stop listening'], action: 'stop', name: 'থামো', desc: 'শোনা বন্ধ করবে' },
    { say: ['মুছে দাও', 'মুছে ফেলো', 'আগেরটা মুছে দাও', 'undo'], action: 'undo', name: 'মুছে দাও', desc: 'শেষ অংশ মুছবে' },
  ];

  function normalize(text) {
    return String(text == null ? '' : text)
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function compileInlineRules() {
    const rules = [];
    for (const group of PUNCTUATION.concat(BREAKS)) {
      for (const phrase of group.say) {
        rules.push({ phrase: normalize(phrase).toLowerCase(), insert: group.insert });
      }
    }
    // Longest phrases first so multi-word commands win.
    rules.sort((a, b) => b.phrase.length - a.phrase.length);
    for (const rule of rules) {
      const body = escapeRegExp(rule.phrase).replace(/ /g, '\\s+');
      // Bangla has no \b support in JS regex, so use whitespace boundaries.
      rule.re = new RegExp('(^|\\s)' + body + '(?=\\s|$)', 'giu');
    }
    return rules;
  }

  const INLINE_RULES = compileInlineRules();
  const CONTROL_LOOKUP = new Map();
  for (const c of CONTROLS) {
    for (const phrase of c.say) CONTROL_LOOKUP.set(normalize(phrase).toLowerCase(), c.action);
  }

  function applyInlineCommands(text) {
    let out = text;
    for (const rule of INLINE_RULES) {
      out = out.replace(rule.re, () => rule.insert);
    }
    return out
      .replace(/[ \t]*\n[ \t]*/g, '\n')                                  // no spaces around line breaks
      .replace(new RegExp('[ \\t]+([' + PUNCT_CLASS + '])', 'g'), '$1')  // no space before punctuation
      .replace(/^[ \t]+|[ \t]+$/g, '');
  }

  function toBanglaDigits(text) {
    return String(text).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
  }

  function formatNumber(n) {
    return toBanglaDigits(String(n));
  }

  /**
   * Turn one final recognition result into either text to append or a command.
   * @param {string} raw  transcript from the recognizer
   * @param {{commands?: boolean, digits?: boolean}} opts
   * @returns {{type:'empty'} | {type:'command', action:string} | {type:'text', text:string}}
   */
  function processSegment(raw, opts) {
    const options = opts || {};
    let text = normalize(raw);
    if (!text) return { type: 'empty' };

    if (options.commands) {
      const bare = text.replace(/[।.,?!]+$/u, '').trim().toLowerCase();
      const action = CONTROL_LOOKUP.get(bare);
      if (action) return { type: 'command', action };
      text = applyInlineCommands(text);
    }
    if (options.digits) text = toBanglaDigits(text);
    return text ? { type: 'text', text } : { type: 'empty' };
  }

  /** Append a processed segment to the existing transcript with sensible spacing. */
  function joinText(existing, segment) {
    if (!segment) return existing;
    const seg = segment.replace(/^[ \t]+/, '');
    if (!existing) return seg;
    if (PUNCT_CLASS.includes(seg[0]) || seg[0] === '\n') {
      return existing.replace(/[ \t]+$/, '') + seg;
    }
    if (/\s$/.test(existing)) return existing + seg;
    return existing + ' ' + seg;
  }

  function countWords(text) {
    return String(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }

  const graphemes = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter('bn', { granularity: 'grapheme' })
    : null;

  /** Visible characters (grapheme clusters), whitespace excluded. */
  function countChars(text) {
    const s = String(text).replace(/\s+/g, '');
    if (!s) return 0;
    if (!graphemes) return Array.from(s).length;
    let n = 0;
    for (const _ of graphemes.segment(s)) n++; // eslint-disable-line no-unused-vars
    return n;
  }

  return {
    normalize,
    processSegment,
    applyInlineCommands,
    joinText,
    toBanglaDigits,
    formatNumber,
    countWords,
    countChars,
    COMMANDS: { punctuation: PUNCTUATION, breaks: BREAKS, controls: CONTROLS },
  };
});
