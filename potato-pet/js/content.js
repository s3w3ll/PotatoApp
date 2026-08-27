window.App = window.App || {};
App.content = (function () {
  const greetings = [
    "You're back! I did a happy wiggle.",
    "Hi hi hi! I was hoping you'd visit.",
    "There you are! My favourite part of the day.",
    "Yay, it's you! Let's have fun."
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

  const spellingLists = {
    1: [
      "cat", "dog", "sun", "tree", "book", "milk",
      "jump", "rain", "fish", "hand", "frog", "cake"
    ],
    2: [
      "planet", "dragon", "garden", "pencil", "window", "yellow",
      "friend", "school", "bridge", "orange", "rocket", "silver"
    ],
    3: [
      "because", "through", "different", "favourite", "tomorrow", "separate",
      "sentence", "important", "beautiful", "dangerous", "calendar", "necessary"
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

  return { greetings, affirmations, moodLines, facts, spellingLists, RUDE_WORDS, validateName };
})();
