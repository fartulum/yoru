import { base, ok, fail, resolveMember, rollDice, pick, clampInt, fmtCoins } from "./shared.js";
import type { BotCommand } from "./types.js";

const EIGHT_BALL = [
  "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.",
  "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
  "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.",
  "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.",
  "Very doubtful.", "Signs point to no.",
];

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break, and it said 'no problem, I'll go to sleep.'",
  "There are 10 types of people: those who understand binary and those who don't.",
  "Why did the developer go broke? Because he used up all his cache.",
  "A SQL query walks into a bar, goes up to two tables and asks: can I join you?",
  "Why do Java developers wear glasses? Because they don't C#.",
  "How many programmers does it take to change a light bulb? None, it's a hardware problem.",
  "I would tell you a UDP joke, but you might not get it.",
  "!false — it's funny because it's true.",
  "Debugging: being the detective in a crime movie where you are also the murderer.",
  "A programmer's spouse says: go to the store and buy a loaf of bread. If they have eggs, buy a dozen. He comes back with 12 loaves of bread.",
  "Why did the CSS developer go to therapy? He had too many issues with his parents.",
];

const QUOTES = [
  "The best way to predict the future is to invent it. — Alan Kay",
  "Talk is cheap. Show me the code. — Linus Torvalds",
  "Programs must be written for people to read. — Harold Abelson",
  "Simplicity is the soul of efficiency. — Austin Freeman",
  "First, solve the problem. Then, write the code. — John Johnson",
  "Make it work, make it right, make it fast. — Kent Beck",
];

const ROASTS = [
  "You're the reason the gene pool needs a lifeguard.",
  "I'd agree with you, but then we'd both be wrong.",
  "Your secrets are always safe with me. I never even listen when you tell me.",
  "You bring everyone so much joy... when you leave the room.",
  "I'm not saying you're slow, but the sun went down twice before you finished that sentence.",
  "Light travels faster than sound, which is why you seemed bright until you spoke.",
];

const COMPLIMENTS = [
  "You're the kind of person who makes servers better just by being in them.",
  "Your energy is contagious. Keep it up.",
  "You have excellent taste in bots, obviously.",
  "Whoever gets to talk to you daily is lucky.",
  "You're doing better than you think you are.",
];

const SHIP_LINES = ["A match made in the server 💕", "This could work out 👀", "Questionable... but cute 🤔", "The math says: soulmates 💘", "I give it a week 😅"];

const WOULD_YOU_RATHER = [
  "Would you rather fight 1 horse-sized duck or 100 duck-sized horses?",
  "Would you rather have unlimited pizza for life or unlimited tacos for life?",
  "Would you rather always be 10 minutes late or always be 20 minutes early?",
  "Would you rather have read every book in the world or know every language?",
  "Would you rather live without music or without TV?",
  "Would you rather be able to fly or be invisible?",
];

const TRUTH_OR_DARE = [
  "Truth: What's the most embarrassing thing in your search history?",
  "Truth: What's a secret talent you have?",
  "Dare: Post the last meme you saved.",
  "Dare: Say something nice about the person above you.",
  "Truth: What's your most controversial opinion about pizza?",
];

const FORTUNES = [
  "A fresh start will put you on your way.", "Good news will come to you by mail.",
  "A pleasant surprise is waiting for you.", "Your hard work will pay off soon.",
  "Adventure can be real or virtual. Choose wisely.", "The bot sees great things in your future.",
  "Trust your instincts today.", "Someone is thinking of you right now.",
];

const ADVICE = [
  "If it works, don't touch it.", "Read the error message. Actually read it.",
  "Sleep is not optional.", "Back up your data. Today.",
  "Drink some water. Right now.", "The answer is in the docs.",
  "Take the walk. Clear the head.", "Ship small, ship often.",
];

const URBAN = [
  "**git** — the sound a programmer makes when things break.",
  "**404** — the internet's way of saying 'I know what you want, but no.'",
  "**ship it** — the moment right before you discover all the bugs.",
  "**works on my machine** — the four most dangerous words in engineering.",
];

const TOPICS = [
  "What's the best game you've played this year?",
  "Pineapple on pizza: yes or no?",
  "What's a skill you'd love to learn?",
  "Cats or dogs, and defend your answer.",
  "What was your first screen name?",
  "What's the last song you listened to?",
];

export const funCommands: BotCommand[] = [
  { name: "8ball", category: "fun", description: "Ask the magic 8-ball", usage: "!8ball <question>", async run(ctx) {
    const q = ctx.args.join(" ");
    if (!q) return void (await fail(ctx.msg, "Usage", "`!8ball <question>`"));
    const e = base("fun", "Magic 8-Ball", `**Q:** ${q}\n**A:** ${pick(EIGHT_BALL)}`);
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "roll", category: "fun", description: "Roll dice (default d6)", usage: "!roll [sides]", async run(ctx) {
    const sides = clampInt(ctx.args[0], 2, 1000, 6);
    await ok(ctx.msg, "fun", "Dice Roll", `You rolled a **${rollDice(sides)}** (d${sides}).`);
  } },
  { name: "dice", category: "fun", description: "Roll multiple dice, e.g. 2d20", usage: "!dice <n>d<sides>", async run(ctx) {
    const m = /^(\d{1,2})d(\d{1,4})$/i.exec(ctx.args[0] ?? "");
    if (!m) return void (await fail(ctx.msg, "Usage", "`!dice <n>d<sides>` e.g. `!dice 2d20`"));
    const n = Math.min(parseInt(m[1]), 10), s = Math.min(parseInt(m[2]), 1000);
    const rolls = Array.from({ length: n }, () => rollDice(s));
    await ok(ctx.msg, "fun", "Dice Roll", `${rolls.map((r) => `**${r}**`).join(" + ")} = **${rolls.reduce((a, b) => a + b, 0)}** (${n}d${s})`);
  } },
  { name: "coinflip", category: "fun", description: "Flip a coin", usage: "!coinflip", async run(ctx) {
    await ok(ctx.msg, "fun", "Coin Flip", `It's **${Math.random() < 0.5 ? "Heads" : "Tails"}**.`);
  } },
  { name: "flip", category: "fun", description: "Flip a coin", usage: "!flip", async run(ctx) {
    await ok(ctx.msg, "fun", "Coin Flip", `It's **${Math.random() < 0.5 ? "Heads" : "Tails"}**.`);
  } },
  { name: "rps", category: "fun", description: "Rock, paper, scissors", usage: "!rps <rock|paper|scissors>", async run(ctx) {
    const moves = ["rock", "paper", "scissors"] as const;
    const mine = ctx.args[0]?.toLowerCase() as (typeof moves)[number];
    if (!moves.includes(mine)) return void (await fail(ctx.msg, "Usage", "`!rps <rock|paper|scissors>`"));
    const bot = moves[Math.floor(Math.random() * 3)];
    const win = (mine === "rock" && bot === "scissors") || (mine === "paper" && bot === "rock") || (mine === "scissors" && bot === "paper");
    await ok(ctx.msg, "fun", "Rock Paper Scissors", `You: **${mine}** vs Me: **${bot}**\n${mine === bot ? "It's a tie!" : win ? "You win!" : "I win!"}`);
  } },
  { name: "joke", category: "fun", description: "Tell a joke", usage: "!joke", async run(ctx) {
    await ok(ctx.msg, "fun", "Joke", pick(JOKES));
  } },
  { name: "meme", category: "fun", description: "A programmer meme caption", usage: "!meme", async run(ctx) {
    await ok(ctx.msg, "fun", "Meme", pick(JOKES));
  } },
  { name: "quote", category: "fun", description: "An inspiring tech quote", usage: "!quote", async run(ctx) {
    await ok(ctx.msg, "fun", "Quote", pick(QUOTES));
  } },
  { name: "roast", category: "fun", description: "Roast a member (playfully)", usage: "!roast [user]", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    await ok(ctx.msg, "fun", "Roast", t ? `${t.user.tag}: ${pick(ROASTS)}` : pick(ROASTS));
  } },
  { name: "compliment", category: "fun", description: "Compliment a member", usage: "!compliment [user]", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    await ok(ctx.msg, "fun", "Compliment", t ? `${t.user.tag}: ${pick(COMPLIMENTS)}` : pick(COMPLIMENTS));
  } },
  { name: "ship", category: "fun", description: "Ship two members", usage: "!ship <user1> <user2>", async run(ctx) {
    const [a, b] = [ctx.msg.mentions.users.at(0), ctx.msg.mentions.users.at(1)];
    if (!a || !b) return void (await fail(ctx.msg, "Usage", "`!ship <user1> <user2>`"));
    const pct = 40 + Math.floor(Math.random() * 61);
    await ok(ctx.msg, "fun", "Ship", `${a.tag} 💕 ${b.tag}\n**${pct}%** — ${pick(SHIP_LINES)}`);
  } },
  { name: "rate", category: "fun", description: "Rate anything out of 10", usage: "!rate <thing>", async run(ctx) {
    const thing = ctx.args.join(" ");
    if (!thing) return void (await fail(ctx.msg, "Usage", "`!rate <thing>`"));
    const n = Math.floor(Math.random() * 11);
    await ok(ctx.msg, "fun", "Rate", `I'd rate **${thing}** a solid **${n}/10**.`);
  } },
  { name: "wyr", category: "fun", description: "Would you rather question", usage: "!wyr", async run(ctx) {
    await ok(ctx.msg, "fun", "Would You Rather", pick(WOULD_YOU_RATHER));
  } },
  { name: "tod", category: "fun", description: "Truth or dare prompt", usage: "!tod", async run(ctx) {
    await ok(ctx.msg, "fun", "Truth or Dare", pick(TRUTH_OR_DARE));
  } },
  { name: "fortune", category: "fun", description: "Get your fortune", usage: "!fortune", async run(ctx) {
    await ok(ctx.msg, "fun", "Fortune Cookie", pick(FORTUNES));
  } },
  { name: "advice", category: "fun", description: "Get questionable advice", usage: "!advice", async run(ctx) {
    await ok(ctx.msg, "fun", "Advice", pick(ADVICE));
  } },
  { name: "urban", category: "fun", description: "A fake urban dictionary entry", usage: "!urban", async run(ctx) {
    await ok(ctx.msg, "fun", "Urban Dictionary", pick(URBAN));
  } },
  { name: "topic", category: "fun", description: "Conversation starter", usage: "!topic", async run(ctx) {
    await ok(ctx.msg, "fun", "Conversation Starter", pick(TOPICS));
  } },
  { name: "avatar", category: "fun", description: "Show a user's avatar", usage: "!avatar [user]", async run(ctx) {
    const u = ctx.msg.mentions.users.first() ?? ctx.msg.author;
    await ctx.msg.reply({ embeds: [base("fun", `${u.tag}'s Avatar`).setImage(u.displayAvatarURL({ size: 512 }))], allowedMentions: { repliedUser: false } });
  } },
  { name: "banner", category: "fun", description: "Show a user's banner", usage: "!banner [user]", async run(ctx) {
    const u = ctx.msg.mentions.users.first() ?? ctx.msg.author;
    const full = await u.fetch().catch(() => u);
    const url = (full as any).bannerURL?.();
    if (!url) return void (await fail(ctx.msg, "No Banner", `${u.tag} doesn't have a profile banner.`));
    await ctx.msg.reply({ embeds: [base("fun", `${u.tag}'s Banner`).setImage(url)], allowedMentions: { repliedUser: false } });
  } },
  { name: "userinfo", category: "fun", description: "Show info about a user", usage: "!userinfo [user]", async run(ctx) {
    const m = (await resolveMember(ctx.msg, ctx.args[0])) ?? ctx.msg.member;
    if (!m) return;
    const e = base("fun", m.user.tag, `${m} — member since <t:${Math.floor(m.joinedTimestamp! / 1000)}:R>`);
    e.setThumbnail(m.user.displayAvatarURL({ size: 256 }));
    e.addFields(
      { name: "Account created", value: `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Roles", value: `${m.roles.cache.size - 1}`, inline: true },
      { name: "User ID", value: m.id, inline: true },
    );
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "serverinfo", category: "fun", description: "Show info about this server", usage: "!serverinfo", async run(ctx) {
    const g = ctx.msg.guild!;
    const e = base("fun", g.name, "Server overview");
    if (g.iconURL()) e.setThumbnail(g.iconURL()!);
    e.addFields(
      { name: "Members", value: `${g.memberCount}`, inline: true },
      { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
      { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
      { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
      { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
      { name: "Boosts", value: `${g.premiumSubscriptionCount ?? 0}`, inline: true },
    );
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "servericon", category: "fun", description: "Show the server icon", usage: "!servericon", async run(ctx) {
    const g = ctx.msg.guild!;
    if (!g.iconURL()) return void (await fail(ctx.msg, "No Icon", "This server has no icon."));
    await ctx.msg.reply({ embeds: [base("fun", `${g.name}'s Icon`).setImage(g.iconURL({ size: 512 })!)], allowedMentions: { repliedUser: false } });
  } },
  { name: "emoji", category: "fun", description: "Enlarge a custom emoji", usage: "!emoji <emoji>", async run(ctx) {
    const m = /<?a?:(\w+):(\d+)>?/.exec(ctx.args[0] ?? "");
    if (!m) return void (await fail(ctx.msg, "Usage", "`!emoji <emoji>`"));
    const url = `https://cdn.discordapp.com/emojis/${m[2]}.png`;
    await ctx.msg.reply({ embeds: [base("fun", `:${m[1]}:`).setImage(url)], allowedMentions: { repliedUser: false } });
  } },
  { name: "count", category: "fun", description: "Counting game: reply with the next number", usage: "!count <number>", async run(ctx) {
    const n = parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(n)) return void (await fail(ctx.msg, "Usage", "`!count <number>`"));
    const expected = ctx.counter();
    if (n === expected + 1) {
      ctx.setCounter(n);
      await ok(ctx.msg, "fun", "Counting", `**${n}** — correct! Next is **${n + 1}**.`);
    } else {
      ctx.setCounter(0);
      await fail(ctx.msg, "Counting Broken", `You said **${n}** but the next number was **${expected + 1}**. Back to 0!`);
    }
  } },
  { name: "reverse", category: "fun", description: "Reverse your text", usage: "!reverse <text>", async run(ctx) {
    const t = ctx.args.join(" ");
    if (!t) return void (await fail(ctx.msg, "Usage", "`!reverse <text>`"));
    await ok(ctx.msg, "fun", "Reversed", [...t].reverse().join(""));
  } },
  { name: "clap", category: "fun", description: "Add 👏 between 👏 your 👏 words", usage: "!clap <text>", async run(ctx) {
    const t = ctx.args.join(" ");
    if (!t) return void (await fail(ctx.msg, "Usage", "`!clap <text>`"));
    await ok(ctx.msg, "fun", "Clap", t.split(/\s+/).join(" 👏 "));
  } },
  { name: "vaporwave", category: "fun", description: "Ａｅｓｔｈｅｔｉｃ your text", usage: "!vaporwave <text>", async run(ctx) {
    const t = ctx.args.join(" ");
    if (!t) return void (await fail(ctx.msg, "Usage", "`!vaporwave <text>`"));
    await ok(ctx.msg, "fun", "Vaporwave", t.replace(/[a-zA-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + 0xfee0)));
  } },
  { name: "mock", category: "fun", description: "MoCk SoMeOnE's TeXt", usage: "!mock <text>", async run(ctx) {
    const t = ctx.args.join(" ");
    if (!t) return void (await fail(ctx.msg, "Usage", "`!mock <text>`"));
    await ok(ctx.msg, "fun", "Mock", [...t].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(""));
  } },
  { name: "lorem", category: "fun", description: "Generate lorem ipsum text", usage: "!lorem [paragraphs]", async run(ctx) {
    const n = clampInt(ctx.args[0], 1, 3, 1);
    const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
    const paras = Array.from({ length: n }, () => Array.from({ length: 30 }, () => pick(words)).join(" "));
    await ok(ctx.msg, "fun", "Lorem Ipsum", paras.join("\n\n").slice(0, 1500));
  } },
  { name: "charcount", category: "fun", description: "Count characters in your text", usage: "!charcount <text>", async run(ctx) {
    const t = ctx.args.join(" ");
    if (!t) return void (await fail(ctx.msg, "Usage", "`!charcount <text>`"));
    await ok(ctx.msg, "fun", "Character Count", `**${t.length}** characters, **${t.split(/\s+/).length}** words.`);
  } },
  { name: "pickfor", category: "fun", description: "Let the bot pick between options", usage: "!pickfor <option1> | <option2> | ...", async run(ctx) {
    const opts = ctx.args.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) return void (await fail(ctx.msg, "Usage", "`!pickfor <a> | <b> | ...`"));
    await ok(ctx.msg, "fun", "I Pick...", `**${pick(opts)}**`);
  } },
  { name: "hack", category: "fun", description: "Fake-hack a member (totally real)", usage: "!hack <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!hack <user>`"));
    const steps = [
      "Locating IP address... 🛰️",
      "Bypassing firewall... 🔓",
      "Downloading passwords... 📥",
      "Accessing mainframe... 💻",
      "Deleting System32... 🗑️",
      "Hack complete. Their search history is now public. 😈",
    ];
    const e = base("fun", `Hacking ${t.user.tag}`, steps.join("\n> "));
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "fakenews", category: "fun", description: "Generate a fake headline", usage: "!fakenews", async run(ctx) {
    const who = ["Local man", "Scientists", "This server", "Your neighbor", "A group of gamers"];
    const what = ["discovers infinite coins", "banned from the internet", "wins lottery twice", "travels to 2077", "finds the last slice of pizza"];
    await ok(ctx.msg, "fun", "Breaking News", `📰 **${pick(who)} ${pick(what)}**`);
  } },
  { name: "slots", category: "fun", description: "Spin the slot machine (free play)", usage: "!slots", async run(ctx) {
    const icons = ["🍒", "🍋", "🍇", "🔔", "⭐", "7️⃣"];
    const a = pick(icons), b = pick(icons), c = pick(icons);
    const jackpot = a === b && b === c;
    await ok(ctx.msg, "fun", "Slots", `**[ ${a} ${b} ${c} ]**\n${jackpot ? "JACKPOT! 🎉" : a === b || b === c ? "So close!" : "Try again!"}`);
  } },
  { name: "hackerman", category: "fun", description: "Feel like a hacker", usage: "!hackerman", async run(ctx) {
    await ok(ctx.msg, "fun", "Hackerman Mode", "```\n" + Array.from({ length: 6 }, () => Array.from({ length: 40 }, () => Math.random() < 0.5 ? "0" : "1").join("")).join("\n") + "\n```");
  } },
  { name: "coinflipstats", category: "fun", description: "Flip 10 coins at once", usage: "!coinflipstats", async run(ctx) {
    const flips = Array.from({ length: 10 }, () => (Math.random() < 0.5 ? "H" : "T"));
    const heads = flips.filter((f) => f === "H").length;
    await ok(ctx.msg, "fun", "10 Coin Flips", `${flips.join(" ")}\n**${heads}** heads, **${10 - heads}** tails.`);
  } },
  { name: "diceguess", category: "fun", description: "Guess the hidden d20 roll", usage: "!diceguess <1-20>", async run(ctx) {
    const g = clampInt(ctx.args[0], 1, 20, 0);
    if (!g) return void (await fail(ctx.msg, "Usage", "`!diceguess <1-20>`"));
    const secret = rollDice(20);
    await ok(ctx.msg, "fun", "Dice Guess", g === secret ? `You got it! It was **${secret}**. 🎉` : `Nope, it was **${secret}**.`);
  } },
  { name: "penis", category: "fun", description: "Scientifically inaccurate measurement", usage: "!penis [user]", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    const n = 3 + Math.floor(Math.random() * 9);
    await ok(ctx.msg, "fun", "Measurement", `${t ? t.user.tag : ctx.msg.author.tag}: **${"=".repeat(n)}D** (${n}cm)`);
  } },
  { name: "slap", category: "fun", description: "Slap someone with a trout", usage: "!slap <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!slap <user>`"));
    await ok(ctx.msg, "fun", "Slap", `${ctx.msg.author} slapped ${t} with a large trout 🐟`);
  } },
  { name: "hug", category: "fun", description: "Hug someone", usage: "!hug <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!hug <user>`"));
    await ok(ctx.msg, "fun", "Hug", `${ctx.msg.author} hugged ${t} 🤗`);
  } },
  { name: "pat", category: "fun", description: "Pat someone on the head", usage: "!pat <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!pat <user>`"));
    await ok(ctx.msg, "fun", "Pat", `${ctx.msg.author} patted ${t} 👋`);
  } },
  { name: "poke", category: "fun", description: "Poke someone", usage: "!poke <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!poke <user>`"));
    await ok(ctx.msg, "fun", "Poke", `${ctx.msg.author} poked ${t} 👉`);
  } },
  { name: "boop", category: "fun", description: "Boop someone", usage: "!boop <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!boop <user>`"));
    await ok(ctx.msg, "fun", "Boop", `${ctx.msg.author} booped ${t} 👽`);
  } },
  { name: "highfive", category: "fun", description: "High five someone", usage: "!highfive <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!highfive <user>`"));
    await ok(ctx.msg, "fun", "High Five", `${ctx.msg.author} high-fived ${t} ✋`);
  } },
  { name: "bite", category: "fun", description: "Bite someone (gently)", usage: "!bite <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!bite <user>`"));
    await ok(ctx.msg, "fun", "Bite", `${ctx.msg.author} bit ${t} 🦷`);
  } },
  { name: "punch", category: "fun", description: "Punch someone", usage: "!punch <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!punch <user>`"));
    await ok(ctx.msg, "fun", "Punch", `${ctx.msg.author} punched ${t} 👊`);
  } },
  { name: "tickle", category: "fun", description: "Tickle someone", usage: "!tickle <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!tickle <user>`"));
    await ok(ctx.msg, "fun", "Tickle", `${ctx.msg.author} tickled ${t} 🪶`);
  } },
  { name: "kill", category: "fun", description: "Dramatically 'kill' someone", usage: "!kill <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!kill <user>`"));
    await ok(ctx.msg, "fun", "Fatality", `${ctx.msg.author} ${pick(["threw a keyboard at", "unplugged", "hit with a rubber duck", "yeeted into the sun"])} ${t}. F.`);
  } },
  { name: "dance", category: "fun", description: "Show off your moves", usage: "!dance", async run(ctx) {
    await ok(ctx.msg, "fun", "Dance", `${ctx.msg.author} is dancing! 💃🕺`);
  } },
  { name: "cry", category: "fun", description: "Express your sadness", usage: "!cry", async run(ctx) {
    await ok(ctx.msg, "fun", "Cry", `${ctx.msg.author} is crying 😭`);
  } },
  { name: "laugh", category: "fun", description: "LOL at someone", usage: "!laugh [user]", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    await ok(ctx.msg, "fun", "Laugh", `${ctx.msg.author} is laughing ${t ? `at ${t}` : "😂"}`);
  } },
  { name: "stare", category: "fun", description: "Stare at someone creepily", usage: "!stare <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!stare <user>`"));
    await ok(ctx.msg, "fun", "Stare", `${ctx.msg.author} is staring at ${t} 👁️👁️`);
  } },
  { name: "triggered", category: "fun", description: "Declare yourself triggered", usage: "!triggered", async run(ctx) {
    await ok(ctx.msg, "fun", "Triggered", `${ctx.msg.author} is TRIGGERED 😡`);
  } },
  { name: "shrug", category: "fun", description: "¯\\_(ツ)_/¯", usage: "!shrug", async run(ctx) {
    await ok(ctx.msg, "fun", "Shrug", "¯\\_(ツ)_/¯");
  } },
  { name: "lenny", category: "fun", description: "( ͡° ͜ʖ ͡°)", usage: "!lenny", async run(ctx) {
    await ok(ctx.msg, "fun", "Lenny", "( ͡° ͜ʖ ͡°)");
  } },
  { name: "tableflip", category: "fun", description: "(╯°□°）╯︵ ┻━┻", usage: "!tableflip", async run(ctx) {
    await ok(ctx.msg, "fun", "Table Flip", "(╯°□°）╯︵ ┻━┻");
  } },
  { name: "unflip", category: "fun", description: "┬─┬ ノ( ゜-゜ノ)", usage: "!unflip", async run(ctx) {
    await ok(ctx.msg, "fun", "Table Unflip", "┬─┬ ノ( ゜-゜ノ)");
  } },
  { name: "fliptable", category: "fun", description: "(╯°□°）╯︵ ┻━┻", usage: "!fliptable", async run(ctx) {
    await ok(ctx.msg, "fun", "Table Flip", "(╯°□°）╯︵ ┻━┻");
  } },
  { name: "coinflip2", category: "fun", description: "Best of 3 coin flips", usage: "!coinflip2", async run(ctx) {
    const r = Array.from({ length: 3 }, () => Math.random() < 0.5 ? "Heads" : "Tails");
    await ok(ctx.msg, "fun", "Best of 3", r.join(", "));
  } },
  { name: "sayhi", category: "fun", description: "Make the bot greet someone", usage: "!sayhi <user>", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    if (!t) return void (await fail(ctx.msg, "Usage", "`!sayhi <user>`"));
    await ok(ctx.msg, "fun", "Hello!", `Hey ${t}! 👋`);
  } },
  { name: "guessnumber", category: "fun", description: "Bot thinks of 1-100, you guess", usage: "!guessnumber <number>", async run(ctx) {
    const g = clampInt(ctx.args[0], 1, 100, 0);
    if (!g) return void (await fail(ctx.msg, "Usage", "`!guessnumber <1-100>`"));
    const secret = rollDice(100);
    const diff = Math.abs(g - secret);
    await ok(ctx.msg, "fun", "Number Guess", diff === 0 ? "Exact! Are you psychic? 🔮" : diff <= 5 ? `So close! It was **${secret}**.` : `Nope, it was **${secret}**.`);
  } },
  { name: "randomcolor", category: "fun", description: "Get a random color", usage: "!randomcolor", async run(ctx) {
    const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
    await ctx.msg.reply({ embeds: [base("fun", `#${hex.toUpperCase()}`, "Random color").setColor(parseInt(hex, 16))], allowedMentions: { repliedUser: false } });
  } },
  { name: "randomnumber", category: "fun", description: "Random number between two values", usage: "!randomnumber <min> <max>", async run(ctx) {
    const min = parseInt(ctx.args[0] ?? "", 10), max = parseInt(ctx.args[1] ?? "", 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return void (await fail(ctx.msg, "Usage", "`!randomnumber <min> <max>`"));
    await ok(ctx.msg, "fun", "Random Number", `**${min + Math.floor(Math.random() * (max - min + 1))}**`);
  } },
  { name: "choose", category: "fun", description: "Choose between options", usage: "!choose <a> | <b> | ...", async run(ctx) {
    const opts = ctx.args.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) return void (await fail(ctx.msg, "Usage", "`!choose <a> | <b> | ...`"));
    await ok(ctx.msg, "fun", "I Choose", `**${pick(opts)}**`);
  } },
  { name: "yesno", category: "fun", description: "Get a definitive yes or no", usage: "!yesno <question>", async run(ctx) {
    const q = ctx.args.join(" ");
    if (!q) return void (await fail(ctx.msg, "Usage", "`!yesno <question>`"));
    await ok(ctx.msg, "fun", "Yes or No", `**${q}**\n→ **${pick(["Yes.", "No.", "Absolutely.", "Definitely not.", "Maybe someday."])}**`);
  } },
  { name: "fact", category: "fun", description: "A random fact", usage: "!fact", async run(ctx) {
    const facts = [
      "Octopuses have three hearts.",
      "Bananas are berries, but strawberries aren't.",
      "The first computer bug was an actual moth (1947).",
      "Honey never spoils. Archaeologists have eaten 3000-year-old honey.",
      "A group of flamingos is called a flamboyance.",
      "There are more possible chess games than atoms in the universe.",
    ];
    await ok(ctx.msg, "fun", "Random Fact", pick(facts));
  } },
  { name: "uselessfact", category: "fun", description: "A useless fact", usage: "!uselessfact", async run(ctx) {
    await ok(ctx.msg, "fun", "Useless Fact", pick([
      "The dot over the letter 'i' is called a tittle.",
      "A shrimp's heart is in its head.",
      "Wombat poop is cube-shaped.",
      "Slugs have four noses.",
    ]));
  } },
  { name: "dogfact", category: "fun", description: "A fact about dogs", usage: "!dogfact", async run(ctx) {
    await ok(ctx.msg, "fun", "Dog Fact", pick([
      "Dogs' noses have unique prints, like fingerprints.",
      "A dog's smell is 10,000-100,000x more sensitive than yours.",
      "Greyhounds can hit 45 mph.",
    ]));
  } },
  { name: "catfact", category: "fun", description: "A fact about cats", usage: "!catfact", async run(ctx) {
    await ok(ctx.msg, "fun", "Cat Fact", pick([
      "Cats sleep 12-16 hours a day.",
      "A cat's purr vibrates at 25-150 Hz, which may promote healing.",
      "Cats can't taste sweetness.",
    ]));
  } },
  { name: "spacefact", category: "fun", description: "A fact about space", usage: "!spacefact", async run(ctx) {
    await ok(ctx.msg, "fun", "Space Fact", pick([
      "A day on Venus is longer than its year.",
      "Neutron stars can spin 600 times per second.",
      "There's a planet where it rains glass, sideways (HD 189733b).",
    ]));
  } },
  { name: "yearprogress", category: "fun", description: "How far through the year we are", usage: "!yearprogress", async run(ctx) {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1).getTime();
    const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
    const pct = ((now.getTime() - start) / (end - start)) * 100;
    const filled = Math.round(pct / 5);
    await ok(ctx.msg, "fun", `${now.getFullYear()} Progress`, `\`${"█".repeat(filled)}${"░".repeat(20 - filled)}\` **${pct.toFixed(1)}%**`);
  } },
  { name: "dayprogress", category: "fun", description: "How far through the day we are", usage: "!dayprogress", async run(ctx) {
    const now = new Date();
    const pct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
    const filled = Math.round(pct / 5);
    await ok(ctx.msg, "fun", "Day Progress", `\`${"█".repeat(filled)}${"░".repeat(20 - filled)}\` **${pct.toFixed(1)}%**`);
  } },
  { name: "time", category: "fun", description: "Show the current time", usage: "!time", async run(ctx) {
    await ok(ctx.msg, "fun", "Current Time", `<t:${Math.floor(Date.now() / 1000)}:F>`);
  } },
  { name: "mylevel", category: "fun", description: "Show your XP level in this server", usage: "!mylevel", async run(ctx) {
    const lvl = ctx.level(ctx.msg.author.id);
    await ok(ctx.msg, "fun", "Your Level", `You are level **${lvl.level}** with **${lvl.xp}** XP.`);
  } },
  { name: "rank", category: "fun", description: "Show your XP rank card", usage: "!rank [user]", async run(ctx) {
    const t = await resolveMember(ctx.msg, ctx.args[0]);
    const id = t?.id ?? ctx.msg.author.id;
    const lvl = ctx.level(id);
    const e = base("fun", `${t?.user.tag ?? ctx.msg.author.tag} — Rank`, `Level **${lvl.level}** · **${lvl.xp}** XP`);
    const pct = Math.min(100, Math.round((lvl.xp % 100)));
    e.addFields({ name: "Progress to next level", value: `\`${"█".repeat(Math.round(pct / 5))}${"░".repeat(20 - Math.round(pct / 5))}\` ${pct}%` });
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "leaderboard", category: "fun", description: "Top members by XP", usage: "!leaderboard", async run(ctx) {
    const top = ctx.topLevels();
    await ok(ctx.msg, "fun", "XP Leaderboard", top.length ? top.join("\n") : "Nobody has XP yet.");
  } },
  { name: "coins", category: "fun", description: "Check your coin balance", usage: "!coins", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    await ok(ctx.msg, "fun", "Your Balance", `You have ${fmtCoins(acc.balance)}.`);
  } },
];