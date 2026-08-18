/** Small animal avatar derived from the student's anonymous alias. */
const ANIMAL_EMOJI: Record<string, string> = {
  Tiger: "🐯",
  Otter: "🦦",
  Falcon: "🦅",
  Panda: "🐼",
  Heron: "🕊️",
  Lynx: "🐈",
  Dolphin: "🐬",
  Ibex: "🐐",
  Gecko: "🦎",
  Puffin: "🐧",
  Jaguar: "🐆",
  Badger: "🦡",
  Osprey: "🦉",
  Marten: "🦫",
  Wombat: "🐨",
  Kestrel: "🦜",
  Narwhal: "🐳",
  Bison: "🦬",
};

function emojiFor(alias: string) {
  for (const [animal, emoji] of Object.entries(ANIMAL_EMOJI)) {
    if (alias.includes(animal)) return emoji;
  }
  return "🎲";
}

function hueFor(alias: string) {
  let hash = 0;
  for (let i = 0; i < alias.length; i += 1) hash = (hash * 31 + alias.charCodeAt(i)) % 360;
  return hash;
}

export function AliasAvatar({ alias, size = 28 }: { alias: string; size?: number }) {
  const hue = hueFor(alias);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        backgroundColor: `hsl(${hue} 70% 92%)`,
        borderColor: `hsl(${hue} 45% 70%)`,
      }}
    >
      {emojiFor(alias)}
    </span>
  );
}
