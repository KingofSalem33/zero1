/**
 * Concept Mapping for Biblical Terms
 *
 * Maps common theological terms, descriptions, and concepts to specific
 * Bible references. This allows users to query using familiar terms like
 * "sermon on the mount" or "ten commandments" without knowing exact verses.
 */

export interface ConceptMapping {
  pattern: RegExp;
  reference: string; // Book chapter:verse format
  description: string;
}

/**
 * Common biblical concepts and their locations
 *
 * Patterns are tested in order, so put more specific patterns first
 */
export const CONCEPT_MAPPINGS: ConceptMapping[] = [
  // ========================================
  // Jesus's Teachings & Sermons
  // ========================================
  {
    pattern: /sermon\s+on\s+the\s+mount/i,
    reference: "Matthew 5:1",
    description: "Sermon on the Mount (Matthew 5-7)"
  },
  {
    pattern: /beatitudes/i,
    reference: "Matthew 5:3",
    description: "The Beatitudes"
  },
  {
    pattern: /lord'?s?\s+prayer/i,
    reference: "Matthew 6:9",
    description: "The Lord's Prayer"
  },
  {
    pattern: /our\s+father\s+(who\s+art|which\s+art)/i,
    reference: "Matthew 6:9",
    description: "Our Father prayer"
  },
  {
    pattern: /golden\s+rule/i,
    reference: "Matthew 7:12",
    description: "The Golden Rule"
  },
  {
    pattern: /great\s+commission/i,
    reference: "Matthew 28:19",
    description: "The Great Commission"
  },
  {
    pattern: /great\s+commandment/i,
    reference: "Matthew 22:37",
    description: "The Great Commandment"
  },

  // ========================================
  // Old Testament Stories & Events
  // ========================================
  {
    pattern: /ten\s+commandments/i,
    reference: "Exodus 20:1",
    description: "The Ten Commandments"
  },
  {
    pattern: /creation\s+(story|account|of\s+the\s+world)/i,
    reference: "Genesis 1:1",
    description: "Creation account"
  },
  {
    pattern: /adam\s+and\s+eve/i,
    reference: "Genesis 2:7",
    description: "Adam and Eve in the Garden"
  },
  {
    pattern: /fall\s+of\s+man/i,
    reference: "Genesis 3:1",
    description: "The Fall"
  },
  {
    pattern: /noah'?s?\s+ark/i,
    reference: "Genesis 6:14",
    description: "Noah's Ark"
  },
  {
    pattern: /the\s+flood/i,
    reference: "Genesis 7:11",
    description: "The Great Flood"
  },
  {
    pattern: /tower\s+of\s+babel/i,
    reference: "Genesis 11:1",
    description: "Tower of Babel"
  },
  {
    pattern: /abraham\s+and\s+isaac/i,
    reference: "Genesis 22:1",
    description: "Abraham's test of faith"
  },
  {
    pattern: /burning\s+bush/i,
    reference: "Exodus 3:2",
    description: "The Burning Bush"
  },
  {
    pattern: /parting\s+(of\s+)?the\s+red\s+sea/i,
    reference: "Exodus 14:21",
    description: "Parting of the Red Sea"
  },
  {
    pattern: /crossing\s+(of\s+)?the\s+red\s+sea/i,
    reference: "Exodus 14:21",
    description: "Crossing the Red Sea"
  },
  {
    pattern: /david\s+and\s+goliath/i,
    reference: "1 Samuel 17:4",
    description: "David and Goliath"
  },
  {
    pattern: /daniel\s+in\s+the\s+lion'?s?\s+den/i,
    reference: "Daniel 6:16",
    description: "Daniel in the lions' den"
  },
  {
    pattern: /fiery\s+furnace/i,
    reference: "Daniel 3:20",
    description: "Shadrach, Meshach, and Abednego in the fiery furnace"
  },
  {
    pattern: /jonah\s+and\s+the\s+(whale|fish)/i,
    reference: "Jonah 1:17",
    description: "Jonah and the great fish"
  },

  // ========================================
  // Psalms & Wisdom
  // ========================================
  {
    pattern: /lord\s+is\s+my\s+shepherd/i,
    reference: "Psalm 23:1",
    description: "Psalm 23 - The Lord is my shepherd"
  },
  {
    pattern: /psalm\s+23/i,
    reference: "Psalm 23:1",
    description: "Psalm 23"
  },
  {
    pattern: /shepherd'?s?\s+psalm/i,
    reference: "Psalm 23:1",
    description: "The Shepherd's Psalm"
  },
  {
    pattern: /valley\s+of\s+the\s+shadow/i,
    reference: "Psalm 23:4",
    description: "Valley of the shadow of death"
  },

  // ========================================
  // New Testament Events
  // ========================================
  {
    pattern: /birth\s+of\s+jesus/i,
    reference: "Luke 2:7",
    description: "Birth of Jesus"
  },
  {
    pattern: /nativity/i,
    reference: "Luke 2:7",
    description: "The Nativity"
  },
  {
    pattern: /christmas\s+story/i,
    reference: "Luke 2:7",
    description: "The Christmas story"
  },
  {
    pattern: /wise\s+men/i,
    reference: "Matthew 2:1",
    description: "The Wise Men"
  },
  {
    pattern: /star\s+of\s+bethlehem/i,
    reference: "Matthew 2:2",
    description: "Star of Bethlehem"
  },
  {
    pattern: /last\s+supper/i,
    reference: "Matthew 26:26",
    description: "The Last Supper"
  },
  {
    pattern: /crucifixion/i,
    reference: "Matthew 27:35",
    description: "The Crucifixion"
  },
  {
    pattern: /resurrection/i,
    reference: "Matthew 28:6",
    description: "The Resurrection"
  },
  {
    pattern: /easter/i,
    reference: "Matthew 28:6",
    description: "Easter - The Resurrection"
  },
  {
    pattern: /ascension/i,
    reference: "Acts 1:9",
    description: "The Ascension"
  },
  {
    pattern: /pentecost/i,
    reference: "Acts 2:1",
    description: "Pentecost"
  },
  {
    pattern: /road\s+to\s+damascus/i,
    reference: "Acts 9:3",
    description: "Paul's conversion on the road to Damascus"
  },
  {
    pattern: /paul'?s?\s+conversion/i,
    reference: "Acts 9:3",
    description: "Paul's conversion"
  },

  // ========================================
  // Parables
  // ========================================
  {
    pattern: /prodigal\s+son/i,
    reference: "Luke 15:11",
    description: "Parable of the Prodigal Son"
  },
  {
    pattern: /good\s+samaritan/i,
    reference: "Luke 10:30",
    description: "Parable of the Good Samaritan"
  },
  {
    pattern: /sower/i,
    reference: "Matthew 13:3",
    description: "Parable of the Sower"
  },
  {
    pattern: /mustard\s+seed/i,
    reference: "Matthew 13:31",
    description: "Parable of the Mustard Seed"
  },
  {
    pattern: /lost\s+sheep/i,
    reference: "Luke 15:4",
    description: "Parable of the Lost Sheep"
  },
  {
    pattern: /talents/i,
    reference: "Matthew 25:14",
    description: "Parable of the Talents"
  },
  {
    pattern: /wise\s+and\s+foolish\s+virgins/i,
    reference: "Matthew 25:1",
    description: "Parable of the Wise and Foolish Virgins"
  },

  // ========================================
  // Famous Verses & Concepts
  // ========================================
  {
    pattern: /god\s+so\s+loved\s+the\s+world/i,
    reference: "John 3:16",
    description: "For God so loved the world..."
  },
  {
    pattern: /love\s+chapter/i,
    reference: "1 Corinthians 13:1",
    description: "1 Corinthians 13 - The Love Chapter"
  },
  {
    pattern: /faith\s+chapter/i,
    reference: "Hebrews 11:1",
    description: "Hebrews 11 - The Faith Chapter"
  },
  {
    pattern: /armor\s+of\s+god/i,
    reference: "Ephesians 6:11",
    description: "The Armor of God"
  },
  {
    pattern: /fruit\s+of\s+the\s+spirit/i,
    reference: "Galatians 5:22",
    description: "Fruit of the Spirit"
  },
  {
    pattern: /fruits?\s+of\s+the\s+spirit/i,
    reference: "Galatians 5:22",
    description: "Fruit of the Spirit"
  },
];

/**
 * Check if user query matches a known biblical concept
 * Returns the reference string if found, null otherwise
 */
export function matchConcept(query: string): string | null {
  const normalized = query.trim();

  for (const mapping of CONCEPT_MAPPINGS) {
    if (mapping.pattern.test(normalized)) {
      console.log(`[Concept Mapping] Matched "${query}" -> ${mapping.reference} (${mapping.description})`);
      return mapping.reference;
    }
  }

  return null;
}
