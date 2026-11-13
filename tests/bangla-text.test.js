// Run with:  node --test tests
const test = require('node:test');
const assert = require('node:assert/strict');
const BT = require('../js/bangla-text.js');

const n = (s) => s.normalize('NFC');
const ON = { commands: true, digits: true };

test('spoken দাঁড়ি becomes ।', () => {
  assert.deepEqual(BT.processSegment('আমি ভাত খাই দাঁড়ি', ON), { type: 'text', text: 'আমি ভাত খাই।' });
});

test('punctuation in the middle of an utterance keeps the following space', () => {
  const r = BT.processSegment('তুমি কেমন আছো প্রশ্নবোধক চিহ্ন আমি ভালো আছি দাঁড়ি', ON);
  assert.equal(r.text, 'তুমি কেমন আছো? আমি ভালো আছি।');
});

test('comma and exclamation', () => {
  assert.equal(BT.processSegment('বাহ কমা কী সুন্দর বিস্ময়সূচক চিহ্ন', ON).text, n('বাহ, কী সুন্দর!'));
});

test('new line and new paragraph', () => {
  assert.equal(BT.processSegment('প্রথম লাইন নতুন লাইন দ্বিতীয় লাইন', ON).text, 'প্রথম লাইন\nদ্বিতীয় লাইন');
  assert.equal(BT.processSegment('শেষ দাঁড়ি নতুন অনুচ্ছেদ শুরু', ON).text, 'শেষ।\n\nশুরু');
});

test('both Unicode spellings of ড় are recognised', () => {
  const decomposed = 'আমি দাঁড়ি';  // ড + nukta
  const precomposed = 'আমি দাঁড়ি';      // ড়
  assert.equal(BT.processSegment(decomposed, ON).text, 'আমি।');
  assert.equal(BT.processSegment(precomposed, ON).text, 'আমি।');
});

test('words that merely contain a command are untouched', () => {
  assert.equal(BT.processSegment('দাম কমানো দরকার', ON).text, 'দাম কমানো দরকার');
  assert.equal(BT.processSegment('সেমিকোলন', ON).text, ';');
});

test('control commands only fire for the whole utterance', () => {
  assert.deepEqual(BT.processSegment('থামো', ON), { type: 'command', action: 'stop' });
  assert.deepEqual(BT.processSegment(' মুছে দাও। ', ON), { type: 'command', action: 'undo' });
  assert.equal(BT.processSegment('তুমি থামো না', ON).type, 'text');
});

test('commands can be switched off', () => {
  assert.equal(BT.processSegment('আমি দাঁড়ি', { commands: false }).text, n('আমি দাঁড়ি'));
  assert.equal(BT.processSegment('থামো', { commands: false }).type, 'text');
});

test('Bangla digits', () => {
  assert.equal(BT.processSegment('আমার বয়স 25', ON).text, n('আমার বয়স ২৫'));
  assert.equal(BT.processSegment('আমার বয়স 25', { digits: false }).text, n('আমার বয়স 25'));
  assert.equal(BT.formatNumber(1971), '১৯৭১');
});

test('empty input', () => {
  assert.deepEqual(BT.processSegment('   ', ON), { type: 'empty' });
  assert.deepEqual(BT.processSegment('দাঁড়ি', { commands: true }), { type: 'text', text: '।' });
});

test('joinText spacing rules', () => {
  assert.equal(BT.joinText('', 'আমি'), 'আমি');
  assert.equal(BT.joinText('আমি', 'ভাত খাই'), 'আমি ভাত খাই');
  assert.equal(BT.joinText('আমি ', '। তুমি'), 'আমি। তুমি');
  assert.equal(BT.joinText('আমি।\n', 'তুমি'), 'আমি।\nতুমি');
  assert.equal(BT.joinText('আমি  ', '\nতুমি'), 'আমি\nতুমি');
  assert.equal(BT.joinText('আমি', ''), 'আমি');
});

test('word and character counts', () => {
  assert.equal(BT.countWords('আমি ভাত খাই।'), 3);
  assert.equal(BT.countWords(' । , '), 0);
  assert.equal(BT.countChars('ক খ'), 2);
  assert.equal(BT.countChars(''), 0);
});
