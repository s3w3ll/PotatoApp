window.App = window.App || {};
App.content = (function () {
  const greetings = [
    "You're back! I did a happy wiggle.",
    "Hi hi hi! I was hoping you'd visit.",
    "There you are! My favourite part of the day.",
    "Yay, it's you! Let's have fun."
  ];

  const bedtime = [
    "Night night!",
    "Sleep time. Sweet dreams.",
    "Snuggling in... goodnight!"
  ];

  // Spoken when the child gets the pet into bed / tucks it (correct drop or tap).
  const sleepPraise = [
    "Aah, my cosy bed!",
    "Perfect. So snuggly.",
    "Yes! Right where I sleep.",
    "Mmm, comfy. Thank you!",
    "Tucked in just right."
  ];

  // Spoken when the child drops the pet or the blanket in the wrong place.
  const sleepNudge = [
    "Oops — my bed's over here!",
    "Not there, silly. Try the bed.",
    "Hehe, that's not my bed.",
    "Almost! The bed, the bed!",
    "Wrong spot — put it on me!"
  ];

  // Spoken when the child pats the pet.
  const petLines = [
    "Ooh, that's nice!",
    "Hehe, that tickles!",
    "More pats, please!",
    "You give the best cuddles.",
    "I feel so loved!",
    "Mmm, cosy."
  ];

  const affirmations = [
    "Making mistakes means your brain is stretching!",
    "You tried something tricky. That's real bravery.",
    "Slow is still forward. I'm proud of you.",
    "Your kindness makes this room brighter.",
    "You figured that out! See what practice does?",
    "It's okay to find things hard. Hard is how we grow.",
    "You showed up today. That matters more than perfect.",
    "I like how you kept going.",
    "Rest is allowed. You've earned a comfy moment.",
    "Being curious is a superpower, and you've got it.",
    "One tiny step counts as a step.",
    "You're a good friend to me."
  ];

  const moodLines = {
    happy:  [
      "I feel great!",
      "Best day. Ten out of ten.",
      "Everything is cosy right now."
    ],
    hungry: [
      "My tummy did a little rumble.",
      "Snack o'clock, maybe?",
      "I'd nibble something tasty."
    ],
    sleepy: [
      "My eyelids are so heavy...",
      "A nap would be lovely.",
      "Yawwwn. Bedtime soon?"
    ],
    bored:  [
      "Wanna play a game?",
      "Let's do something fun!",
      "I've got the wiggles, help!"
    ]
  };

  const facts = [
    { id: 1, text: "A group of flamingos is called a flamboyance.", topic: "animals" },
    { id: 2, text: "Octopuses have three hearts and blue blood.", topic: "animals" },
    { id: 3, text: "Butterflies taste with their feet.", topic: "animals" },
    { id: 4, text: "A group of crows is called a murder.", topic: "animals" },
    { id: 5, text: "Penguins propose with a pebble.", topic: "animals" },
    { id: 6, text: "Dolphins sleep with one eye open.", topic: "animals" },
    { id: 7, text: "Sloths only come down from trees to poop once a week.", topic: "animals" },
    { id: 8, text: "A giraffe's tongue is 20 inches long and pink.", topic: "animals" },
    { id: 9, text: "Hummingbirds can fly backwards and upside down.", topic: "animals" },
    { id: 10, text: "Foxes use Earth's magnetic field to hunt under the snow.", topic: "animals" },
    { id: 11, text: "Octopi can change colour in one tenth of a second.", topic: "animals" },

    { id: 12, text: "Honey never spoils — jars in ancient tombs were still edible.", topic: "food" },
    { id: 13, text: "A single vanilla pod grows only in specific climates.", topic: "food" },
    { id: 14, text: "Carrots weren't orange until the 1600s.", topic: "food" },
    { id: 15, text: "Peanuts aren't actually nuts, they're legumes.", topic: "food" },
    { id: 16, text: "Strawberries are the only fruit with seeds on the outside.", topic: "food" },
    { id: 17, text: "Cashews grow in a shell attached to a fruit.", topic: "food" },
    { id: 18, text: "Watermelons are 92% water.", topic: "food" },
    { id: 19, text: "Bananas are berries, but strawberries aren't.", topic: "food" },
    { id: 20, text: "Lemons have more sugar than strawberries.", topic: "food" },

    { id: 21, text: "A day on Venus is longer than its year.", topic: "space" },
    { id: 22, text: "The sun is so big a million Earths fit inside.", topic: "space" },
    { id: 23, text: "Saturn's rings are made of ice and rock.", topic: "space" },
    { id: 24, text: "A year on Neptune is longer than 160 Earth years.", topic: "space" },
    { id: 25, text: "The moon is slowly moving away from Earth.", topic: "space" },
    { id: 26, text: "Jupiter's Great Red Spot is a storm bigger than Earth.", topic: "space" },
    { id: 27, text: "There are more stars than grains of sand on all Earth's beaches.", topic: "space" },
    { id: 28, text: "Venus spins backwards compared to most planets.", topic: "space" },
    { id: 29, text: "A day on Mercury is longer than a Mercury year.", topic: "space" },

    { id: 30, text: "Your body has enough carbon to make about 900 pencils.", topic: "body" },
    { id: 31, text: "You have more bacteria on your skin than people on Earth.", topic: "body" },
    { id: 32, text: "Your sneeze travels at 100 mph.", topic: "body" },
    { id: 33, text: "You can't hum while holding your nose.", topic: "body" },
    { id: 34, text: "The smallest bone in your body is in your ear.", topic: "body" },
    { id: 35, text: "Your fingerprints are unique, like a code only you have.", topic: "body" },
    { id: 36, text: "You blink about 20,000 times a day without thinking.", topic: "body" },
    { id: 37, text: "Your teeth are the only part of your body that can't heal itself.", topic: "body" },
    { id: 38, text: "Your nose can remember 50,000 different smells.", topic: "body" },

    { id: 39, text: "The Sahara desert sometimes gets snow.", topic: "world" },
    { id: 40, text: "Bees can recognise individual human faces.", topic: "world" },
    { id: 41, text: "The Amazon rainforest makes 20% of Earth's oxygen.", topic: "world" },
    { id: 42, text: "Clownfish can all turn into females if needed.", topic: "world" },
    { id: 43, text: "Some jellyfish can live forever and never age.", topic: "world" },
    { id: 44, text: "Cats have a third eyelid you can't normally see.", topic: "world" },
    { id: 45, text: "Cheetahs can't roar, they purr and meow like housecats.", topic: "world" }
  ];

  // Each entry is { word, clue }. The clue is what gets read aloud and shown —
  // never the word itself. Levels 1-2 are concrete things, so their clues are
  // "what / where / who" riddles. Level 3 words are abstract, so their clues are
  // fill-in-the-blank sentences with ___ where the word belongs.
  const spellingLists = {
    1: [
      { word: "cat",  clue: "What pet says meow and likes to chase mice?" },
      { word: "dog",  clue: "What pet says woof and loves to fetch a ball?" },
      { word: "sun",  clue: "What is bright and yellow and warms us up in the sky by day?" },
      { word: "tree", clue: "What tall plant has a trunk, branches and leaves?" },
      { word: "book", clue: "What do you read that is full of pages and words?" },
      { word: "milk", clue: "What white drink comes from a cow?" },
      { word: "jump", clue: "What do you do when you bend your knees and push off the ground?" },
      { word: "rain", clue: "What falls from grey clouds and makes puddles?" },
      { word: "fish", clue: "What animal swims with fins and breathes under water?" },
      { word: "hand", clue: "What part of your body has five fingers?" },
      { word: "frog", clue: "What green animal hops and says ribbit?" },
      { word: "cake", clue: "What sweet treat do you eat on your birthday with candles on top?" }
    ],
    2: [
      { word: "planet", clue: "What do we call a big round world that circles the sun, like Earth or Mars?" },
      { word: "dragon", clue: "What make-believe creature has wings and breathes fire?" },
      { word: "garden", clue: "Where do people grow flowers and vegetables outside?" },
      { word: "pencil", clue: "What do you write with that has grey lead and an eraser?" },
      { word: "window", clue: "What glass opening in a wall do you look out of?" },
      { word: "yellow", clue: "What colour are bananas and lemons?" },
      { word: "friend", clue: "Who is someone you like to play with and care about?" },
      { word: "school", clue: "Where do children go on weekdays to learn?" },
      { word: "bridge", clue: "What do you build to cross over a river?" },
      { word: "orange", clue: "What round fruit is also the name of a colour?" },
      { word: "rocket", clue: "What machine blasts off with fire and flies into space?" },
      { word: "silver", clue: "What shiny grey colour are many coins and spoons?" }
    ],
    3: [
      { word: "because",   clue: "I stayed inside ___ it was raining." },
      { word: "through",   clue: "The train went ___ the long dark tunnel." },
      { word: "different", clue: "My shoes match, but our two coats are ___." },
      { word: "favourite", clue: "Ice cream is my ___ dessert of all." },
      { word: "tomorrow",  clue: "Today is Monday, so ___ is Tuesday." },
      { word: "separate",  clue: "Please ___ the red blocks from the blue ones." },
      { word: "sentence",  clue: "Start every ___ with a capital letter." },
      { word: "important", clue: "Drinking water is ___ for staying healthy." },
      { word: "beautiful", clue: "The sunset over the sea was so ___." },
      { word: "dangerous", clue: "Playing with fire is very ___." },
      { word: "calendar",  clue: "I checked the ___ to find the date of the party." },
      { word: "necessary", clue: "A warm coat is ___ when the weather is cold." }
    ]
  };

  const RUDE_WORDS = ["butt", "poop", "stupid", "hate", "dumb"];

  function validateName(raw) {
    const value = String(raw == null ? "" : raw).trim();
    if (value.length < 1 || value.length > 16) return { ok: false, reason: "length" };
    const low = value.toLowerCase();
    if (RUDE_WORDS.some(w => low.includes(w))) return { ok: false, reason: "blocked" };
    return { ok: true, value };
  }

  return { greetings, bedtime, petLines, sleepPraise, sleepNudge, affirmations, moodLines, facts, spellingLists, RUDE_WORDS, validateName };
})();
