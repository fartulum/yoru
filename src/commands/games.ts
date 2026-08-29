import { base, ok, fail, rollDice, pick, clampInt, fmtCoins, ch } from "./shared.js";
import type { BotCommand } from "./types.js";

const TRIVIA: { q: string; a: string[] }[] = [
  { q: "What is the capital of Japan?", a: ["tokyo"] },
  { q: "What planet is known as the Red Planet?", a: ["mars"] },
  { q: "How many continents are there?", a: ["7", "seven"] },
  { q: "What is the largest ocean on Earth?", a: ["pacific", "pacific ocean"] },
  { q: "In what year did the first iPhone launch?", a: ["2007"] },
  { q: "What language has the most native speakers?", a: ["mandarin", "chinese", "mandarin chinese"] },
  { q: "What is the chemical symbol for gold?", a: ["au"] },
  { q: "Who wrote 'Romeo and Juliet'?", a: ["shakespeare", "william shakespeare"] },
  { q: "What is the smallest prime number?", a: ["2", "two"] },
  { q: "How many sides does a hexagon have?", a: ["6", "six"] },
  { q: "What gas do plants absorb?", a: ["co2", "carbon dioxide"] },
  { q: "What is the largest desert on Earth?", a: ["antarctica", "antarctic desert"] },
  { q: "What does 'HTTP' stand for?", a: ["hypertext transfer protocol", "hyper text transfer protocol"] },
  { q: "Which company created the C++ language?", a: ["bell labs", "at&t"] },
  { q: "What is the square root of 144?", a: ["12", "twelve"] },
];

const WORDS = ["discord", "keyboard", "computer", "internet", "protocol", "bandwidth", "algorithm", "terminal", "hardware", "software", "network", "database"];

const RPSLS = ["rock", "paper", "scissors", "lizard", "spock"] as const;

export const gameCommands: BotCommand[] = [
  { name: "trivia", category: "games", description: "Answer a trivia question (30s)", usage: "!trivia", async run(ctx) {
    const t = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
    await ctx.msg.reply({ embeds: [base("games", "Trivia", `${t.q}\nYou have **30 seconds**.`)], allowedMentions: { repliedUser: false } });
    try {
      const collected = await ch(ctx.msg).awaitMessages({
        filter: (m) => m.author.id === ctx.msg.author.id && t.a.includes(m.content.trim().toLowerCase()),
        max: 1, time: 30_000, errors: ["time"],
      });
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 100;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "Correct!", `Well done, <@${ctx.msg.author.id}>! +${fmtCoins(100)}`)] });
    } catch {
      await ch(ctx.msg).send({ embeds: [base("games", "Time's Up!", `The answer was **${t.a[0]}**.`)] });
    }
  } },
  { name: "duel", category: "games", description: "Coin duel against the bot (50/50)", usage: "!duel <amount>", async run(ctx) {
    const amount = parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(amount) || amount < 1) return void (await fail(ctx.msg, "Usage", "`!duel <amount>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (amount > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    if (Math.random() < 0.5) {
      acc.balance += amount;
      ctx.saveEco();
      await ok(ctx.msg, "games", "Duel Won", `You win the duel! +${fmtCoins(amount)} (balance: ${fmtCoins(acc.balance)})`);
    } else {
      acc.balance -= amount;
      ctx.saveEco();
      await fail(ctx.msg, "Duel Lost", `I win this one. -${fmtCoins(amount)} (balance: ${fmtCoins(acc.balance)})`);
    }
  } },
  { name: "guess", category: "games", description: "Guess a number 1-100 (3 tries)", usage: "!guess", async run(ctx) {
    const secret = rollDice(100);
    await ctx.msg.reply({ embeds: [base("games", "Number Guess", "I picked a number between 1 and 100. You have **3 tries** — reply with your guesses!")], allowedMentions: { repliedUser: false } });
    for (let i = 0; i < 3; i++) {
      try {
        const collected = await ch(ctx.msg).awaitMessages({
          filter: (m) => m.author.id === ctx.msg.author.id && /^\d+$/.test(m.content.trim()),
          max: 1, time: 30_000, errors: ["time"],
        });
        const g = parseInt(collected.first()!.content.trim(), 10);
        if (g === secret) {
          const acc = ctx.eco(ctx.msg.author.id);
          acc.balance += 100;
          ctx.saveEco();
          await ch(ctx.msg).send({ embeds: [base("games", "You Got It!", `**${secret}** was right! +${fmtCoins(100)}`)] });
          return;
        }
        await ch(ctx.msg).send({ embeds: [base("games", "Wrong", g < secret ? "Higher!" : "Lower!")] });
      } catch {
        await ch(ctx.msg).send({ embeds: [base("games", "Time's Up!", `The number was **${secret}**.`)] });
        return;
      }
    }
    await ch(ctx.msg).send({ embeds: [base("games", "Out of Tries", `The number was **${secret}**.`)] });
  } },
  { name: "rpsls", category: "games", description: "Rock paper scissors lizard spock", usage: "!rpsls <move>", async run(ctx) {
    const mine = ctx.args[0]?.toLowerCase() as (typeof RPSLS)[number];
    if (!RPSLS.includes(mine)) return void (await fail(ctx.msg, "Usage", "`!rpsls <rock|paper|scissors|lizard|spock>`"));
    const bot = pick([...RPSLS]);
    const beats: Record<string, string[]> = { rock: ["scissors", "lizard"], paper: ["rock", "spock"], scissors: ["paper", "lizard"], lizard: ["spock", "paper"], spock: ["scissors", "rock"] };
    const result = mine === bot ? "It's a tie!" : beats[mine].includes(bot) ? "You win!" : "I win!";
    await ok(ctx.msg, "games", "RPSLS", `You: **${mine}** vs Me: **${bot}**\n${result}`);
  } },
  { name: "hangman", category: "games", description: "Play hangman in chat", usage: "!hangman", async run(ctx) {
    const word = pick(WORDS);
    const shown = Array.from({ length: word.length }, () => "_");
    let wrong = 0;
    await ctx.msg.reply({ embeds: [base("games", "Hangman", `\`${shown.join(" ")}\` (${word.length} letters)\nGuess letters one at a time — 6 wrong guesses ends it.`)], allowedMentions: { repliedUser: false } });
    while (wrong < 6 && shown.includes("_")) {
      try {
        const collected = await ch(ctx.msg).awaitMessages({
          filter: (m) => m.author.id === ctx.msg.author.id && /^[a-z]$/i.test(m.content.trim()),
          max: 1, time: 60_000, errors: ["time"],
        });
        const letter = collected.first()!.content.trim().toLowerCase();
        if (word.includes(letter)) {
          [...word].forEach((ch, i) => { if (ch === letter) shown[i] = letter; });
          await ch(ctx.msg).send({ embeds: [base("games", "Hangman", `\`${shown.join(" ")}\``)] });
        } else {
          wrong++;
          await ch(ctx.msg).send({ embeds: [base("games", "Hangman", `❌ **${letter}** isn't in the word. ${6 - wrong} lives left.`)] });
        }
      } catch {
        await ch(ctx.msg).send({ embeds: [base("games", "Hangman", `Time's up! The word was **${word}**.`)] });
        return;
      }
    }
    if (!shown.includes("_")) {
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 150;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "You Win!", `The word was **${word}**! +${fmtCoins(150)}`)] });
    } else {
      await ch(ctx.msg).send({ embeds: [base("games", "Game Over", `The word was **${word}**.`)] });
    }
  } },
  { name: "tictactoe", category: "games", description: "Play tic-tac-toe against the bot", usage: "!tictactoe", async run(ctx) {
    const board = Array(9).fill("⬜");
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const render = () => board.map((c, i) => `${c}${(i + 1) % 3 === 0 ? "\n" : ""}`).join("");
    const winner = (s: string) => lines.some((l) => l.every((i) => board[i] === s));
    await ctx.msg.reply({ embeds: [base("games", "Tic-Tac-Toe", `${render()}\nYou are ❌. Reply with a position 1-9.`)], allowedMentions: { repliedUser: false } });
    for (let turn = 0; turn < 9; turn++) {
      if (turn % 2 === 0) {
        try {
          const collected = await ch(ctx.msg).awaitMessages({
            filter: (m) => m.author.id === ctx.msg.author.id && /^[1-9]$/.test(m.content.trim()) && board[parseInt(m.content.trim(), 10) - 1] === "⬜",
            max: 1, time: 60_000, errors: ["time"],
          });
          board[parseInt(collected.first()!.content.trim(), 10) - 1] = "❌";
        } catch {
          await ch(ctx.msg).send({ embeds: [base("games", "Tic-Tac-Toe", "Time's up! Game over.")] });
          return;
        }
        if (winner("❌")) {
          const acc = ctx.eco(ctx.msg.author.id);
          acc.balance += 200;
          ctx.saveEco();
          await ch(ctx.msg).send({ embeds: [base("games", "You Win!", `${render()}\nNice! +${fmtCoins(200)}`)] });
          return;
        }
      } else {
        const free = board.map((c, i) => (c === "⬜" ? i : -1)).filter((i) => i >= 0);
        board[pick(free)] = "⭕";
        if (winner("⭕")) {
          await ch(ctx.msg).send({ embeds: [base("games", "I Win!", `${render()}\nBetter luck next time.`)] });
          return;
        }
      }
    }
    await ch(ctx.msg).send({ embeds: [base("games", "Tic-Tac-Toe", `${render()}\nIt's a draw!`)] });
  } },
  { name: "blackjack", category: "games", description: "Simple blackjack vs the bot", usage: "!blackjack <bet>", async run(ctx) {
    const bet = parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(bet) || bet < 1) return void (await fail(ctx.msg, "Usage", "`!blackjack <bet>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (bet > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    const draw = () => rollDice(11);
    const you = draw() + draw();
    const me = draw() + draw();
    if (you > 21) {
      acc.balance -= bet; ctx.saveEco();
      return void (await fail(ctx.msg, "Blackjack", `You: **${you}** — bust! You lose ${fmtCoins(bet)}.`));
    }
    if (you > me || me > 21) {
      acc.balance += bet; ctx.saveEco();
      await ok(ctx.msg, "games", "Blackjack", `You: **${you}** vs Me: **${me}** — you win ${fmtCoins(bet)}!`);
    } else if (you === me) {
      await ok(ctx.msg, "games", "Blackjack", `You: **${you}** vs Me: **${me}** — push, bet returned.`);
    } else {
      acc.balance -= bet; ctx.saveEco();
      await fail(ctx.msg, "Blackjack", `You: **${you}** vs Me: **${me}** — I win. You lose ${fmtCoins(bet)}.`);
    }
  } },
  { name: "highlow", category: "games", description: "Guess if the next number is higher or lower", usage: "!highlow <higher|lower>", async run(ctx) {
    const guess = (ctx.args[0] ?? "").toLowerCase();
    if (!["higher", "lower"].includes(guess)) return void (await fail(ctx.msg, "Usage", "`!highlow <higher|lower>`"));
    const first = rollDice(10), second = rollDice(10);
    const win = guess === "higher" ? second > first : second < first;
    await (win ? ok : fail)(ctx.msg, "games", "High Low", `First: **${first}** → Second: **${second}**\n${win ? "You win!" : "You lose."}`);
  } },
  { name: "wordguess", category: "games", description: "Unscramble a word (30s)", usage: "!wordguess", async run(ctx) {
    const word = pick(WORDS);
    const scrambled = [...word].sort(() => Math.random() - 0.5).join("");
    await ctx.msg.reply({ embeds: [base("games", "Word Guess", `Unscramble: **${scrambled}**\n30 seconds.`)], allowedMentions: { repliedUser: false } });
    try {
      await ch(ctx.msg).awaitMessages({
        filter: (m) => m.author.id === ctx.msg.author.id && m.content.trim().toLowerCase() === word,
        max: 1, time: 30_000, errors: ["time"],
      });
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 120;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "Correct!", `The word was **${word}**! +${fmtCoins(120)}`)] });
    } catch {
      await ch(ctx.msg).send({ embeds: [base("games", "Time's Up!", `The word was **${word}**.`)] });
    }
  } },
  { name: "math", category: "games", description: "Solve a math problem (20s)", usage: "!math", async run(ctx) {
    const a = 5 + rollDice(45), b = 2 + rollDice(18);
    const ops = [["+", a + b], ["-", a - b], ["×", a * b]] as const;
    const [op, ans] = pick([...ops]);
    await ctx.msg.reply({ embeds: [base("games", "Quick Math", `What is **${a} ${op} ${b}**?\n20 seconds.`)], allowedMentions: { repliedUser: false } });
    try {
      await ch(ctx.msg).awaitMessages({
        filter: (m) => m.author.id === ctx.msg.author.id && parseInt(m.content.trim(), 10) === ans,
        max: 1, time: 20_000, errors: ["time"],
      });
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 80;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "Correct!", `The answer was **${ans}**! +${fmtCoins(80)}`)] });
    } catch {
      await ch(ctx.msg).send({ embeds: [base("games", "Time's Up!", `The answer was **${ans}**.`)] });
    }
  } },
  { name: "typing", category: "games", description: "Type the phrase fast (15s)", usage: "!typing", async run(ctx) {
    const phrase = pick(["the quick brown fox jumps over the lazy dog", "discord bots are the future of community", "i can type faster than you think", "practice makes perfect every time"]);
    await ctx.msg.reply({ embeds: [base("games", "Typing Test", `Type this exactly:\n> ${phrase}\n15 seconds.`)], allowedMentions: { repliedUser: false } });
    const start = Date.now();
    try {
      await ch(ctx.msg).awaitMessages({
        filter: (m) => m.author.id === ctx.msg.author.id && m.content.trim().toLowerCase() === phrase,
        max: 1, time: 15_000, errors: ["time"],
      });
      const secs = (Date.now() - start) / 1000;
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 60;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "Fast!", `Done in **${secs.toFixed(1)}s**! +${fmtCoins(60)}`)] });
    } catch {
      await ch(ctx.msg).send({ embeds: [base("games", "Too Slow!", "Better luck next time.")] });
    }
  } },
  { name: "reactiontest", category: "games", description: "React fast to a message", usage: "!reactiontest", async run(ctx) {
    const m = await ch(ctx.msg).send({ embeds: [base("games", "Reaction Test", "React with ⚡ as fast as you can!")] });
    await m.react("⚡");
    const start = Date.now();
    try {
      await m.awaitReactions({ filter: (r, u) => u.id === ctx.msg.author.id && r.emoji.name === "⚡", max: 1, time: 10_000, errors: ["time"] });
      const secs = (Date.now() - start) / 1000;
      const acc = ctx.eco(ctx.msg.author.id);
      acc.balance += 50;
      ctx.saveEco();
      await ch(ctx.msg).send({ embeds: [base("games", "Reaction Test", `**${secs.toFixed(2)}s** — +${fmtCoins(50)}`)] });
    } catch {
      await ch(ctx.msg).send({ embeds: [base("games", "Too Slow!", "No reaction detected.")] });
    }
  } },
  { name: "coinflipduel", category: "games", description: "Best of 3 coin flips", usage: "!coinflipduel", async run(ctx) {
    const results = Array.from({ length: 3 }, () => Math.random() < 0.5);
    const wins = results.filter(Boolean).length;
    await (wins >= 2 ? ok : fail)(ctx.msg, "games", "Coin Flip Duel", `${results.map((r) => (r ? "W" : "L")).join(" ")} — ${wins >= 2 ? "you win the duel!" : "you lose the duel."}`);
  } },
  { name: "quiz", category: "games", description: "Alias for !trivia", usage: "!quiz", async run(ctx) {
    const trivia = gameCommands.find((c) => c.name === "trivia")!;
    await trivia.run(ctx);
  } },
  { name: "minesweeper", category: "games", description: "Random 5x5 minesweeper grid", usage: "!minesweeper", async run(ctx) {
    const grid = Array.from({ length: 25 }, () => (Math.random() < 0.2 ? "💣" : "🟦"));
    const rows = Array.from({ length: 5 }, (_, r) => grid.slice(r * 5, r * 5 + 5).join(""));
    await ok(ctx.msg, "games", "Minesweeper", rows.join("\n"));
  } },
  { name: "connectfour", category: "games", description: "Play connect four vs the bot (simplified)", usage: "!connectfour", async run(ctx) {
    await ok(ctx.msg, "games", "Connect Four", "Dropping a piece... 🟡\n**You win!** (The bot is a terrible player.)");
  } },
  { name: "chess", category: "games", description: "Bot challenges you to chess", usage: "!chess", async run(ctx) {
    await ok(ctx.msg, "games", "Chess", "♟️ I resign before we even start. You're clearly too good.");
  } },
  { name: "snake", category: "games", description: "ASCII snake preview", usage: "!snake", async run(ctx) {
    await ok(ctx.msg, "games", "Snake", "```\n" + ["🟩🟩🟩", "  🟩🍎", "      "].join("\n") + "\n```One day this will be playable. Today is not that day.");
  } },
  { name: "2048", category: "games", description: "2048 preview", usage: "!2048", async run(ctx) {
    await ok(ctx.msg, "games", "2048", "```\n 2   .   .   .\n .   .   2   .\n .   .   .   .\n .   .   .   .\n```Swipe to merge... in your imagination.");
  } },
  { name: "diceroll", category: "games", description: "Roll 2d6", usage: "!diceroll", async run(ctx) {
    const a = rollDice(6), b = rollDice(6);
    await ok(ctx.msg, "games", "Dice Roll", `🎲 **${a}** + 🎲 **${b}** = **${a + b}**`);
  } },
  { name: "lucky", category: "games", description: "Test your luck (1-100)", usage: "!lucky", async run(ctx) {
    const n = rollDice(100);
    await (n >= 70 ? ok : fail)(ctx.msg, "games", "Lucky Number", `Your luck today: **${n}/100** ${n >= 90 ? "— incredibly lucky!" : n >= 70 ? "— not bad!" : "— stay inside."}`);
  } },
  { name: "battle", category: "games", description: "Text battle vs the bot", usage: "!battle", async run(ctx) {
    const moves = ["⚔️ slashes", "🛡️ blocks", "🔥 casts fireball", "🗡️ backstabs", "💥 uses ultimate"];
    const you = 100, me = 100;
    let yHp = you, mHp = me;
    const log: string[] = [];
    while (yHp > 0 && mHp > 0) {
      const dmg = 10 + rollDice(25);
      mHp -= dmg; log.push(`You ${pick(moves)} for **${dmg}** (bot: ${Math.max(0, mHp)} HP)`);
      if (mHp <= 0) break;
      const mdmg = 10 + rollDice(25);
      yHp -= mdmg; log.push(`Bot ${pick(moves)} for **${mdmg}** (you: ${Math.max(0, yHp)} HP)`);
    }
    await ok(ctx.msg, "games", "Battle Result", `${log.slice(-4).join("\n")}\n\n**${yHp > 0 ? "You win! 🏆" : "The bot wins. 🤖"}**`);
  } },
];