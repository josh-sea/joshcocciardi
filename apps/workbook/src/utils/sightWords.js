// The most common English words a workbook will throw at a young reader. We warm
// the shared audio cache with these once (from the Word Bank screen) so "the",
// "and", "it", etc. play instantly for every kid, everywhere, and never cost a
// generation again. This is the first ~200 of the Fry high-frequency list plus a
// handful of workbook-instruction verbs kids meet constantly.
export const SIGHT_WORDS = [
  // Fry first 100
  'the', 'of', 'and', 'a', 'to', 'in', 'is', 'you', 'that', 'it',
  'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'I',
  'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word',
  'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said',
  'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if',
  'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so',
  'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look',
  'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people',
  'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now',
  'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part',
  // Fry second 100
  'over', 'new', 'sound', 'take', 'only', 'little', 'work', 'know', 'place', 'year',
  'live', 'me', 'back', 'give', 'most', 'very', 'after', 'thing', 'our', 'just',
  'name', 'good', 'sentence', 'man', 'think', 'say', 'great', 'where', 'help', 'through',
  'much', 'before', 'line', 'right', 'too', 'mean', 'old', 'any', 'same', 'tell',
  'boy', 'follow', 'came', 'want', 'show', 'also', 'around', 'form', 'three', 'small',
  'set', 'put', 'end', 'does', 'another', 'well', 'large', 'must', 'big', 'even',
  'such', 'because', 'turn', 'here', 'why', 'ask', 'went', 'men', 'read', 'need',
  'land', 'different', 'home', 'us', 'move', 'try', 'kind', 'hand', 'picture', 'again',
  'change', 'off', 'play', 'spell', 'air', 'away', 'animal', 'house', 'point', 'page',
  'letter', 'mother', 'answer', 'found', 'study', 'still', 'learn', 'should', 'add', 'story',
  // Common workbook instruction verbs / words
  'circle', 'underline', 'draw', 'color', 'match', 'count', 'fill', 'blank',
  'choose', 'pick', 'complete', 'finish', 'trace', 'cut', 'paste', 'label',
  'question', 'directions', 'example', 'sentence', 'sentences', 'word', 'words',
  'correct', 'best', 'true', 'false', 'yes', 'plus', 'minus', 'equals', 'total',
];
