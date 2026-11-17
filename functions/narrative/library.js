// ---------------------------------------------------------------------------
// Narrative Lab: the technique library and transformation catalog.
//
// This file is the product's core asset (see the Narrative Propagation
// Framework doc). Every finding the pipeline stores records VERSION, so when a
// definition here changes, old findings can be rescored and compared. Bump the
// version on any change to an id, a layer, or a definition's meaning.
//
// The browser never keeps its own copy: nlStatus returns this library, so the
// UI always shows the definitions the backend scored with.
// ---------------------------------------------------------------------------

const VERSION = '0.1.0';

// Layer 2 (reasoning) and Layer 3 (rhetoric). Sources: SemEval-2023 Task 3
// persuasion techniques (semeval), the Cambridge inoculation set
// (inoculation), and classic fallacy taxonomies (fallacy). Each technique
// carries the question the report offers back to the reader.
const TECHNIQUES = [
  // ── Layer 2: does the argument hold up? ──
  { id: 'straw-man', layer: 2, name: 'Straw man', source: 'semeval',
    definition: 'Restates an opposing position in a weaker or distorted form, then refutes that version instead of the real one.',
    question: 'Is that what the other side actually says? How would they put it themselves?' },
  { id: 'red-herring', layer: 2, name: 'Red herring', source: 'semeval',
    definition: 'Introduces an irrelevant topic to pull attention away from the point at issue.',
    question: 'How does this connect to the original question? What happened to that question?' },
  { id: 'whataboutism', layer: 2, name: 'Whataboutism', source: 'semeval',
    definition: 'Deflects a criticism by pointing to a supposedly comparable wrong by someone else, without answering it.',
    question: 'Even if the other wrong is real, does it answer this criticism?' },
  { id: 'false-dilemma', layer: 2, name: 'False dilemma', source: 'semeval',
    definition: 'Presents two options as the only ones when others exist.',
    question: 'Are those really the only two options? What would a third look like?' },
  { id: 'causal-oversimplification', layer: 2, name: 'Causal oversimplification', source: 'semeval',
    definition: 'Assigns a single cause to an outcome that has several, or treats a correlation as a cause.',
    question: 'What other causes could explain this? What evidence links this cause to this effect?' },
  { id: 'slippery-slope', layer: 2, name: 'Slippery slope', source: 'semeval',
    definition: 'Claims a first step will inevitably lead to an extreme outcome, without showing the chain.',
    question: 'What would each step in that chain need for it to happen? Is each one likely?' },
  { id: 'appeal-to-authority', layer: 2, name: 'Appeal to authority', source: 'semeval',
    definition: 'Treats a claim as true because of who said it, where that person is not an authority on the point or the authority is disputed.',
    question: 'Is this person an expert on this specific point? What do other experts say?' },
  { id: 'bandwagon', layer: 2, name: 'Appeal to popularity', source: 'semeval',
    definition: 'Argues a claim is true or right because many people believe or do it.',
    question: 'Would this still be true if fewer people believed it?' },
  { id: 'tu-quoque', layer: 2, name: 'Appeal to hypocrisy', source: 'semeval',
    definition: 'Dismisses an argument because the person making it has acted inconsistently with it.',
    question: 'Setting aside whether they live by it, is the argument itself right or wrong?' },
  { id: 'ad-hominem', layer: 2, name: 'Ad hominem', source: 'inoculation',
    definition: 'Attacks the character or motives of a person instead of addressing their argument.',
    question: 'Setting aside who said it, is the claim itself right or wrong?' },
  { id: 'hasty-generalization', layer: 2, name: 'Hasty generalization', source: 'fallacy',
    definition: 'Draws a broad conclusion from a small or unrepresentative set of cases.',
    question: 'How many cases is this based on? Would a larger sample show the same thing?' },
  { id: 'false-equivalence', layer: 2, name: 'False equivalence', source: 'fallacy',
    definition: 'Treats two things as equal in weight or kind when they differ in important ways.',
    question: 'In what ways are these two things actually different?' },
  { id: 'cherry-picking', layer: 2, name: 'Cherry picking', source: 'fallacy',
    definition: 'Presents only the evidence that supports a conclusion while leaving out evidence that contradicts it.',
    question: 'What evidence would point the other way? Is any of it mentioned?' },
  { id: 'incoherence', layer: 2, name: 'Incoherence', source: 'inoculation',
    definition: 'Makes claims that contradict each other within the same piece.',
    question: 'Can both of these claims be true at the same time?' },

  // ── Layer 3: how is it trying to move me? ──
  { id: 'loaded-language', layer: 3, name: 'Loaded language', source: 'semeval',
    definition: 'Uses words with strong emotional connotation to influence the reader, beyond what the evidence in the text supports.',
    question: 'How would this sentence read in neutral words? Does the claim still hold?' },
  { id: 'name-calling', layer: 3, name: 'Name calling or labeling', source: 'semeval',
    definition: 'Attaches a label to a person or group meant to make the audience fear, hate, or admire them.',
    question: 'What does this label assume? Would the people labeled accept it?' },
  { id: 'exaggeration', layer: 3, name: 'Exaggeration or minimization', source: 'semeval',
    definition: 'Represents something as much larger, worse, smaller, or less important than the evidence shows.',
    question: 'What are the actual numbers or scale here?' },
  { id: 'appeal-to-fear', layer: 3, name: 'Appeal to fear', source: 'semeval',
    definition: 'Seeks support by building anxiety or panic about an outcome, rather than by showing its likelihood.',
    question: 'How likely is the feared outcome, and what is that estimate based on?' },
  { id: 'flag-waving', layer: 3, name: 'Flag waving', source: 'semeval',
    definition: 'Appeals to group pride or identity (nation, party, faith, community) to justify a position.',
    question: 'Would someone in the same group who disagrees be less of a member?' },
  { id: 'appeal-to-values', layer: 3, name: 'Appeal to values', source: 'semeval',
    definition: 'Links a position to values the audience holds dear, in place of reasons the position serves them.',
    question: 'Does this position actually serve that value, or is the value just attached to it?' },
  { id: 'doubt', layer: 3, name: 'Doubt', source: 'semeval',
    definition: 'Questions the credibility of someone or something without supplying evidence for the doubt.',
    question: 'What is the evidence for this doubt, beyond raising it?' },
  { id: 'questioning-reputation', layer: 3, name: 'Questioning the reputation', source: 'semeval',
    definition: 'Undermines a person or institution by attacking their record or standing in place of their claim.',
    question: 'If their record were spotless, would the claim be any more or less true?' },
  { id: 'guilt-by-association', layer: 3, name: 'Guilt by association', source: 'semeval',
    definition: 'Discredits someone by linking them to a group or figure the audience already rejects.',
    question: 'Does the association actually show anything about this claim?' },
  { id: 'scapegoating', layer: 3, name: 'Scapegoating', source: 'inoculation',
    definition: 'Blames a single person or group for a complex problem.',
    question: 'What other causes could explain this? How much is this group really responsible for?' },
  { id: 'slogans', layer: 3, name: 'Slogans', source: 'semeval',
    definition: 'A brief, striking phrase that stands in for an argument.',
    question: 'What argument is this phrase standing in for? Does it hold up spelled out?' },
  { id: 'conversation-killer', layer: 3, name: 'Thought-terminating cliché', source: 'semeval',
    definition: 'A phrase that discourages further thought or discussion ("it is what it is," "do your own research").',
    question: 'What question is this phrase closing off? What would answering it look like?' },
  { id: 'appeal-to-time', layer: 3, name: 'Appeal to urgency', source: 'semeval',
    definition: 'Insists action must happen now, without showing why waiting would cost anything.',
    question: 'What happens if I wait a day and check before reacting?' },
  { id: 'obfuscation', layer: 3, name: 'Obfuscation or vagueness', source: 'semeval',
    definition: 'Uses deliberately unclear wording so the audience can read in what they want.',
    question: 'What exactly is being claimed here? Could it be read more than one way?' },
  { id: 'repetition', layer: 3, name: 'Repetition', source: 'semeval',
    definition: 'Repeats the same phrase or claim so it feels true by familiarity.',
    question: 'Without the repetition, what evidence is offered for this?' },
];

// Layer 4: BEND maneuvers (Carley, Carnegie Mellon). Eight act on content and
// eight on communities.
const MANEUVERS = [
  { id: 'engage', kind: 'content', name: 'Engage', definition: 'Brings in content relevant to the audience to draw them in.' },
  { id: 'explain', kind: 'content', name: 'Explain', definition: 'Provides details or elaboration on a topic.' },
  { id: 'excite', kind: 'content', name: 'Excite', definition: 'Elicits a positive emotion such as joy or enthusiasm.' },
  { id: 'enhance', kind: 'content', name: 'Enhance', definition: 'Encourages the audience to continue with or expand a topic.' },
  { id: 'dismiss', kind: 'content', name: 'Dismiss', definition: 'Suggests a topic is unimportant.' },
  { id: 'distort', kind: 'content', name: 'Distort', definition: 'Alters the main message so it is perceived differently.' },
  { id: 'dismay', kind: 'content', name: 'Dismay', definition: 'Elicits a negative emotion such as sadness, anger, or fear.' },
  { id: 'distract', kind: 'content', name: 'Distract', definition: 'Redirects attention to a different topic.' },
  { id: 'back', kind: 'community', name: 'Back', definition: 'Increases the standing of a leader or voice for a group.' },
  { id: 'build', kind: 'community', name: 'Build', definition: 'Creates a group or the appearance of one.' },
  { id: 'bridge', kind: 'community', name: 'Bridge', definition: 'Connects two or more groups.' },
  { id: 'boost', kind: 'community', name: 'Boost', definition: 'Makes members of a group feel more connected.' },
  { id: 'neutralize', kind: 'community', name: 'Neutralize', definition: 'Reduces the standing or influence of a leader or voice.' },
  { id: 'nuke', kind: 'community', name: 'Nuke', definition: 'Tries to break up or dismantle a group.' },
  { id: 'narrow', kind: 'community', name: 'Narrow', definition: 'Pushes a group toward a narrower or more extreme focus.' },
  { id: 'neglect', kind: 'community', name: 'Neglect', definition: 'Reduces the attention or support a group receives.' },
];

// Layer 5: the five invariants (Korobeynikov, Davydiuk and Mokhor, NATO
// CCDCOE 2026).
const INVARIANTS = [
  { id: 'epistemic', name: 'Epistemic', definition: 'Shared criteria of truth and verification.',
    attack: '"You can\'t trust any source."',
    question: 'If no source can be trusted, how are you deciding this claim is true?' },
  { id: 'axiological', name: 'Axiological', definition: 'Value hierarchies guiding collective choice.',
    attack: 'Making every value look hypocritical or equivalent.',
    question: 'Is every side really equally bad here, or are there real differences?' },
  { id: 'identificatory', name: 'Identificatory', definition: 'Conceptions of group belonging.',
    attack: 'Recasting neighbors as an enemy out-group.',
    question: 'Do I know people in that group who don\'t fit this description?' },
  { id: 'social', name: 'Social', definition: 'Trust in institutions and their legitimacy.',
    attack: '"Every institution is captured."',
    question: 'Which institutions, specifically, and what is the evidence about each one?' },
  { id: 'teleological', name: 'Teleological', definition: 'Shared visions of the future.',
    attack: '"It\'s already over, nothing can be done."',
    question: 'Who benefits if people believe nothing can change?' },
];

// The relational counterpart to the techniques: what changed between a source
// and a derivative. `direction` keeps the catalog from only finding fault.
const TRANSFORMATIONS = [
  { id: 'T1', name: 'Omission', direction: 'degrades', definition: 'Caveats, hedges, or counter-evidence in the source are missing.' },
  { id: 'T2', name: 'Certainty escalation', direction: 'degrades', definition: '"May suggest" becomes "proves."' },
  { id: 'T3', name: 'Scope inflation', direction: 'degrades', definition: 'One case becomes a trend; "some" becomes "all."' },
  { id: 'T4', name: 'Causal upgrade', direction: 'degrades', definition: 'A correlation in the source is stated as a cause.' },
  { id: 'T5', name: 'Attribution shift', direction: 'degrades', definition: 'A view is assigned to the wrong party, or a report becomes an admission.' },
  { id: 'T6', name: 'Decontextualized quote', direction: 'degrades', definition: 'Accurate words, stripped of what surrounded them.' },
  { id: 'T7', name: 'Role casting added', direction: 'degrades', definition: 'A villain, victim, or hero the source did not name.' },
  { id: 'T8', name: 'Emotional amplification', direction: 'degrades', definition: 'Neutral source language replaced with loaded language.' },
  { id: 'T9', name: 'Call to action added', direction: 'neutral', definition: 'The source informs; the derivative tells the audience what to do or whom to blame.' },
  { id: 'T10', name: 'Unsupported addition', direction: 'degrades', definition: 'A claim presented as coming from the source that is not in it.' },
  { id: 'T11', name: 'Selective emphasis', direction: 'degrades', definition: 'A minor point in the source becomes the whole story.' },
  { id: 'T12', name: 'Headline gap', direction: 'degrades', definition: 'The headline or thumbnail claims more than the body supports.' },
  { id: 'T13', name: 'Context added', direction: 'improves', definition: 'Background, definitions, or history the source lacked.' },
  { id: 'T14', name: 'Sourcing added', direction: 'improves', definition: 'New primary documents, data, or named sources.' },
  { id: 'T15', name: 'Correction', direction: 'improves', definition: 'Fixes an error in the source.' },
  { id: 'T16', name: 'Fair disagreement', direction: 'neutral', definition: 'Disputes the source while representing it accurately.' },
];

// Scoring baselines are per genre: a loaded word in an op-ed means less than
// the same word in a news headline.
const GENRES = ['news', 'analysis', 'opinion', 'advocacy', 'satire', 'social-post', 'transcript', 'press-release', 'research'];
const FORMATS = ['article', 'headline', 'thread', 'short-post', 'video-transcript', 'podcast-transcript', 'newsletter', 'report', 'other'];
const ROLES = ['originator', 'translator', 'niche-adapter', 'amplifier', 'critic', 'audience'];
const RELATIONS = ['quotes', 'summarizes', 'reacts-to', 'rebuts', 'echoes'];
const LINK_EVIDENCE = ['user-linked', 'explicit-link', 'explicit-mention', 'quote-match', 'inferred-echo'];

const techniqueIds = (layer) => TECHNIQUES.filter((t) => layer === undefined || t.layer === layer).map((t) => t.id);
const transformationIds = () => TRANSFORMATIONS.map((t) => t.id);
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

const LIBRARY = {
  version: VERSION,
  techniques: TECHNIQUES,
  maneuvers: MANEUVERS,
  invariants: INVARIANTS,
  transformations: TRANSFORMATIONS,
  genres: GENRES,
  formats: FORMATS,
  roles: ROLES,
  relations: RELATIONS,
  linkEvidence: LINK_EVIDENCE,
};

module.exports = {
  VERSION,
  TECHNIQUES,
  MANEUVERS,
  INVARIANTS,
  TRANSFORMATIONS,
  GENRES,
  FORMATS,
  ROLES,
  RELATIONS,
  LINK_EVIDENCE,
  LIBRARY,
  techniqueIds,
  transformationIds,
  byId,
};
