/** Anonymous leaderboard names: adjective + animal, e.g. RunningTiger. */
const ADJECTIVES = [
  "Running",
  "Silent",
  "Brave",
  "Clever",
  "Swift",
  "Bright",
  "Curious",
  "Steady",
  "Bold",
  "Calm",
  "Eager",
  "Kind",
  "Lucky",
  "Noble",
  "Quick",
  "Sharp",
  "Sunny",
  "Wise",
];

const ANIMALS = [
  "Tiger",
  "Otter",
  "Falcon",
  "Panda",
  "Heron",
  "Lynx",
  "Dolphin",
  "Ibex",
  "Gecko",
  "Puffin",
  "Jaguar",
  "Badger",
  "Osprey",
  "Marten",
  "Wombat",
  "Kestrel",
  "Narwhal",
  "Bison",
];

export function randomAlias(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}${animal}`;
}

/** Builds an alias that is not already used inside the class. */
export function uniqueAlias(taken: Set<string>): string {
  for (let i = 0; i < 60; i += 1) {
    const alias = randomAlias();
    if (!taken.has(alias)) return alias;
  }
  let suffix = 2;
  let alias = `${randomAlias()}${suffix}`;
  while (taken.has(alias)) {
    suffix += 1;
    alias = `${randomAlias()}${suffix}`;
  }
  return alias;
}

export const DAILY_TOKEN_CAP = 3;
