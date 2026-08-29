import {
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInput,
  type Message,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Slash-style text commands for the Discord bot.
 * Every reply is a professional embed. Categories: moderation, fun, economy, games.
 */

export interface CommandContext {
  msg: Message;
  isOwner: boolean;
  args: string[];
}

export interface BotCommand {
  name: string;
  category: "moderation" | "fun" | "economy" | "games" | "core";
  description: string;
  usage: string;
  modOnly?: boolean;
  run: (ctx: CommandContext) => Promise<void>;
}

const COLORS: Record<string, number> = {
  moderation: 0x5865f2,
  fun: 0xf47fff,
  economy: 0x57f287,
  games: 0xfee75c,
  core: 0x99aab5,
};

export function embed(category: keyof typeof COLORS, title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS[category] ?? 0x99aab5)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: "yoru" });
}

function err(ctx: CommandContext, text: string) {
  return ctx.msg.reply({
    embeds: [embed("core", "Error", text)],
    allowedMentions: { repliedUser: false },
  });
}

/* ------------------------------- economy store ------------------------------ */

const DATA_DIR = join(process.cwd(), "data");
const ECO_FILE = join(DATA_DIR, "economy.json");

export interface EcoAccount {
  balance: number;
  lastDaily: number;
  workCooldown: number;
}

function loadEco(): Record<string, EcoAccount> {
  try {
    return JSON.parse(readFileSync(ECO_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveEco(data: Record<string, EcoAccount>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ECO_FILE, JSON.stringify(data, null, 2));
}

export function getAccount(data: Record<string, EcoAccount>, id: string): EcoAccount {
  if (!data[id]) data[id] = { balance: 100, lastDaily: 0, workCooldown: 0 };
  return data[id];
}

export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WORK_COOLDOWN_MS = 60 * 60 * 1000;

export function fmtCoins(n: number): string {
  return `${Math.floor(n).toLocaleString("en-US")} :coin:`;
}

/* --------------------------------- helpers --------------------------------- */

export function rollDice(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

const EIGHT_BALL = [
  "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.",
  "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
  "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
  "Cannot predict now.", "Don't count on it.", "My reply is no.",
  "My sources say no.", "Outlook not so good.", "Very doubtful.",
];

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break, and it said 'no problem, I'll go to sleep.'",
  "There are 10 types of people: those who understand binary and those who don't.",
  "Why did the developer go broke? Because he used up all his cache.",
  "A SQL query walks into a bar, goes up to two tables and asks: can I join you?",
];

const TRIVIA: { q: string; a: string[] }[] = [
  { q: "What is the capital of Japan?", a: ["tokyo"] },
  { q: "What planet is known as the Red Planet?", a: ["mars"] },
  { q: "How many continents are there?", a: ["7", "seven"] },
  { q: "What is the largest ocean on Earth?", a: ["pacific", "pacific ocean"] },
  { q: "In what year did the first iPhone launch?", a: ["2007"] },
  { q: "What language has the most native speakers?", a: ["mandarin", "chinese", "mandarin chinese"] },
];

/* --------------------------------- commands -------------------------------- */

export const commands: BotCommand[] = [
  /* core */
  {
    name: "help",
    category: "core",
    description: "List all available commands",
    usage: "!help [category]",
    async run(ctx) {
      const cat = ctx.args[0]?.toLowerCase();
      const list = cat && cat in COLORS ? commands.filter((c) => c.category === cat) : commands;
      const e = embed("core", "Command List", cat ? `**${cat}** commands` : "All commands. Use `!help <category>` to filter.");
      for (const c of list) {
        e.addFields({
          name: `\`${c.usage}\``,
          value: `${c.description}${c.modOnly ? " *(mod only)*" : ""}`,
          inline: true,
        });
      }
      await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
    },
  },

  /* moderation */
  {
    name: "ban",
    category: "moderation",
    description: "Ban a member",
    usage: "!ban @user [reason]",
    modOnly: true,
    async run(ctx) {
      const target = ctx.msg.mentions.members?.first();
      if (!target) return void (await err(ctx, "Mention a user to ban."));
      await target.ban({ reason: ctx.args.slice(1).join(" ") || "No reason provided" });
      await ctx.msg.reply({ embeds: [embed("moderation", "Member Banned", `${target.user.tag} has been banned.`)] });
    },
  },
  {
    name: "kick",
    category: "moderation",
    description: "Kick a member",
    usage: "!kick @user [reason]",
    modOnly: true,
    async run(ctx) {
      const target = ctx.msg.mentions.members?.first();
      if (!target) return void (await err(ctx, "Mention a user to kick."));
      await target.kick(ctx.args.slice(1).join(" ") || "No reason provided");
      await ctx.msg.reply({ embeds: [embed("moderation", "Member Kicked", `${target.user.tag} has been kicked.`)] });
    },
  },
  {
    name: "timeout",
    category: "moderation",
    description: "Timeout a member (minutes)",
    usage: "!timeout @user <minutes>",
    modOnly: true,
    async run(ctx) {
      const target = ctx.msg.mentions.members?.first();
      const minutes = parseInt(ctx.args[1] ?? "", 10);
      if (!target || !Number.isFinite(minutes) || minutes < 1) return void (await err(ctx, "Usage: `!timeout @user <minutes>`"));
      await target.timeout(minutes * 60_000, "Timeout via command");
      await ctx.msg.reply({ embeds: [embed("moderation", "Timeout", `${target.user.tag} timed out for ${minutes} min.`)] });
    },
  },
  {
    name: "clear",
    category: "moderation",
    description: "Bulk delete messages (2-100)",
    usage: "!clear <count>",
    modOnly: true,
    async run(ctx) {
      const count = parseInt(ctx.args[0] ?? "", 10);
      if (!Number.isFinite(count) || count < 2 || count > 100) return void (await err(ctx, "Give a count between 2 and 100."));
      const deleted = await ctx.msg.channel.bulkDelete(count, true);
      await ctx.msg.channel.send({ embeds: [embed("moderation", "Messages Cleared", `${deleted.size} messages deleted.`)] });
    },
  },
  {
    name: "slowmode",
    category: "moderation",
    description: "Set channel slowmode (seconds)",
    usage: "!slowmode <seconds>",
    modOnly: true,
    async run(ctx) {
      const secs = parseInt(ctx.args[0] ?? "", 10);
      if (!Number.isFinite(secs) || secs < 0 || secs > 21600) return void (await err(ctx, "Give a value between 0 and 21600 seconds."));
      if (ctx.msg.channel.isTextBased() && "setRateLimitPerUser" in ctx.msg.channel) {
        await (ctx.msg.channel as any).setRateLimitPerUser(secs);
      }
      await ctx.msg.reply({ embeds: [embed("moderation", "Slowmode", `Slowmode set to ${secs}s.`)] });
    },
  },

  /* fun */
  {
    name: "8ball",
    category: "fun",
    description: "Ask the magic 8-ball",
    usage: "!8ball <question>",
    async run(ctx) {
      const q = ctx.args.join(" ");
      if (!q) return void (await err(ctx, "Ask me a question!"));
      const answer = EIGHT_BALL[rollDice(EIGHT_BALL.length) - 1];
      await ctx.msg.reply({ embeds: [embed("fun", "Magic 8-Ball", `**Q:** ${q}\n**A:** ${answer}`)] });
    },
  },
  {
    name: "roll",
    category: "fun",
    description: "Roll a die (default 6 sides)",
    usage: "!roll [sides]",
    async run(ctx) {
      const sides = parseInt(ctx.args[0] ?? "6", 10);
      if (!Number.isFinite(sides) || sides < 2) return void (await err(ctx, "Give at least 2 sides."));
      await ctx.msg.reply({ embeds: [embed("fun", "Dice Roll", `You rolled a **${rollDice(sides)}** (d${sides}).`)] });
    },
  },
  {
    name: "coinflip",
    category: "fun",
    description: "Flip a coin",
    usage: "!coinflip",
    async run(ctx) {
      await ctx.msg.reply({ embeds: [embed("fun", "Coin Flip", `It's **${Math.random() < 0.5 ? "Heads" : "Tails"}**.`)] });
    },
  },
  {
    name: "rps",
    category: "fun",
    description: "Rock, paper, scissors",
    usage: "!rps <rock|paper|scissors>",
    async run(ctx) {
      const moves = ["rock", "paper", "scissors"] as const;
      const mine = ctx.args[0]?.toLowerCase() as (typeof moves)[number];
      if (!moves.includes(mine)) return void (await err(ctx, "Usage: `!rps <rock|paper|scissors>`"));
      const bot = moves[Math.floor(Math.random() * 3)];
      const win = (mine === "rock" && bot === "scissors") || (mine === "paper" && bot === "rock") || (mine === "scissors" && bot === "paper");
      const result = mine === bot ? "It's a tie!" : win ? "You win!" : "I win!";
      await ctx.msg.reply({ embeds: [embed("fun", "Rock Paper Scissors", `You: **${mine}** vs Me: **${bot}**\n${result}`)] });
    },
  },
  {
    name: "joke",
    category: "fun",
    description: "Tell a joke",
    usage: "!joke",
    async run(ctx) {
      await ctx.msg.reply({ embeds: [embed("fun", "Joke", JOKES[Math.floor(Math.random() * JOKES.length)])] });
    },
  },
  {
    name: "avatar",
    category: "fun",
    description: "Show a user's avatar",
    usage: "!avatar [@user]",
    async run(ctx) {
      const user = ctx.msg.mentions.users.first() ?? ctx.msg.author;
      await ctx.msg.reply({ embeds: [embed("fun", `${user.tag}'s Avatar`, " ").setImage(user.displayAvatarURL({ size: 512 }))] });
    },
  },
  {
    name: "userinfo",
    category: "fun",
    description: "Show info about a user",
    usage: "!userinfo [@user]",
    async run(ctx) {
      const m = ctx.msg.mentions.members?.first() ?? ctx.msg.member;
      if (!m) return;
      const e = embed("fun", m.user.tag, `Member since <t:${Math.floor(m.joinedTimestamp! / 1000)}:R>`);
      e.addFields(
        { name: "Account created", value: `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Roles", value: `${m.roles.cache.size - 1}`, inline: true },
      );
      await ctx.msg.reply({ embeds: [e] });
    },
  },
  {
    name: "serverinfo",
    category: "fun",
    description: "Show info about this server",
    usage: "!serverinfo",
    async run(ctx) {
      const g = ctx.msg.guild!;
      const e = embed("fun", g.name, "Server overview");
      e.addFields(
        { name: "Members", value: `${g.memberCount}`, inline: true },
        { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
      );
      await ctx.msg.reply({ embeds: [e] });
    },
  },

  /* economy */
  {
    name: "balance",
    category: "economy",
    description: "Check your coin balance",
    usage: "!balance [@user]",
    async run(ctx) {
      const data = loadEco();
      const id = ctx.msg.mentions.users.first()?.id ?? ctx.msg.author.id;
      const acc = getAccount(data, id);
      saveEco(data);
      await ctx.msg.reply({ embeds: [embed("economy", "Balance", `<@${id}> has ${fmtCoins(acc.balance)}.`)] });
    },
  },
  {
    name: "daily",
    category: "economy",
    description: "Claim your daily reward",
    usage: "!daily",
    async run(ctx) {
      const data = loadEco();
      const acc = getAccount(data, ctx.msg.author.id);
      const now = Date.now();
      if (now - acc.lastDaily < DAILY_COOLDOWN_MS) {
        const wait = Math.ceil((DAILY_COOLDOWN_MS - (now - acc.lastDaily)) / 3_600_000);
        return void (await err(ctx, `Daily already claimed. Come back in ~${wait}h.`));
      }
      acc.lastDaily = now;
      acc.balance += 250;
      saveEco(data);
      await ctx.msg.reply({ embeds: [embed("economy", "Daily Reward", `You claimed ${fmtCoins(250)}. New balance: ${fmtCoins(acc.balance)}.`)] });
    },
  },
  {
    name: "work",
    category: "economy",
    description: "Work for coins (1h cooldown)",
    usage: "!work",
    async run(ctx) {
      const data = loadEco();
      const acc = getAccount(data, ctx.msg.author.id);
      const now = Date.now();
      if (now - acc.workCooldown < WORK_COOLDOWN_MS) {
        const wait = Math.ceil((WORK_COOLDOWN_MS - (now - acc.workCooldown)) / 60_000);
        return void (await err(ctx, `You're tired. Come back in ~${wait} min.`));
      }
      acc.workCooldown = now;
      const pay = 20 + rollDice(60);
      acc.balance += pay;
      saveEco(data);
      await ctx.msg.reply({ embeds: [embed("economy", "Work", `You earned ${fmtCoins(pay)}. Balance: ${fmtCoins(acc.balance)}.`)] });
    },
  },
  {
    name: "gamble",
    category: "economy",
    description: "Gamble coins (double or nothing)",
    usage: "!gamble <amount>",
    async run(ctx) {
      const amount = parseInt(ctx.args[0] ?? "", 10);
      if (!Number.isFinite(amount) || amount < 1) return void (await err(ctx, "Usage: `!gamble <amount>`"));
      const data = loadEco();
      const acc = getAccount(data, ctx.msg.author.id);
      if (amount > acc.balance) return void (await err(ctx, "You don't have that many coins."));
      if (Math.random() < 0.5) {
        acc.balance += amount;
        saveEco(data);
        await ctx.msg.reply({ embeds: [embed("economy", "Gamble Won", `You won ${fmtCoins(amount)}! Balance: ${fmtCoins(acc.balance)}.`)] });
      } else {
        acc.balance -= amount;
        saveEco(data);
        await ctx.msg.reply({ embeds: [embed("economy", "Gamble Lost", `You lost ${fmtCoins(amount)}. Balance: ${fmtCoins(acc.balance)}.`)] });
      }
    },
  },
  {
    name: "pay",
    category: "economy",
    description: "Give coins to someone",
    usage: "!pay @user <amount>",
    async run(ctx) {
      const target = ctx.msg.mentions.users.first();
      const amount = parseInt(ctx.args[1] ?? "", 10);
      if (!target || !Number.isFinite(amount) || amount < 1) return void (await err(ctx, "Usage: `!pay @user <amount>`"));
      const data = loadEco();
      const acc = getAccount(data, ctx.msg.author.id);
      if (amount > acc.balance) return void (await err(ctx, "You don't have that many coins."));
      acc.balance -= amount;
      getAccount(data, target.id).balance += amount;
      saveEco(data);
      await ctx.msg.reply({ embeds: [embed("economy", "Payment Sent", `You sent ${fmtCoins(amount)} to <@${target.id}>.`)] });
    },
  },
  {
    name: "leaderboard",
    category: "economy",
    description: "Richest members",
    usage: "!leaderboard",
    async run(ctx) {
      const data = loadEco();
      const top = Object.entries(data).sort((a, b) => b[1].balance - a[1].balance).slice(0, 10);
      const lines = top.map(([id, acc], i) => `**${i + 1}.** <@${id}> — ${fmtCoins(acc.balance)}`);
      await ctx.msg.reply({ embeds: [embed("economy", "Leaderboard", lines.join("\n") || "Nobody has coins yet.")] });
    },
  },

  /* games */
  {
    name: "trivia",
    category: "games",
    description: "Answer a trivia question (30s)",
    usage: "!trivia",
    async run(ctx) {
      const t = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
      await ctx.msg.reply({ embeds: [embed("games", "Trivia", `${t.q}\nYou have 30 seconds.`)] });
      try {
        const collected = await ctx.msg.channel.awaitMessages({
          filter: (m) => m.author.id === ctx.msg.author.id && t.a.includes(m.content.trim().toLowerCase()),
          max: 1,
          time: 30_000,
          errors: ["time"],
        });
        await ctx.msg.channel.send({ embeds: [embed("games", "Trivia", `Correct, <@${ctx.msg.author.id}>! The answer was **${t.a[0]}**.`)] });
      } catch {
        await ctx.msg.channel.send({ embeds: [embed("games", "Trivia", `Time's up! The answer was **${t.a[0]}**.`)] });
      }
    },
  },
  {
    name: "duel",
    category: "games",
    description: "Coin duel against the bot (50/50)",
    usage: "!duel <amount>",
    async run(ctx) {
      const amount = parseInt(ctx.args[0] ?? "", 10);
      if (!Number.isFinite(amount) || amount < 1) return void (await err(ctx, "Usage: `!duel <amount>`"));
      const data = loadEco();
      const acc = getAccount(data, ctx.msg.author.id);
      if (amount > acc.balance) return void (await err(ctx, "You don't have that many coins."));
      if (Math.random() < 0.5) {
        acc.balance += amount;
        saveEco(data);
        await ctx.msg.reply({ embeds: [embed("games", "Duel Won", `You won the duel! +${fmtCoins(amount)} (balance: ${fmtCoins(acc.balance)}).`)] });
      } else {
        acc.balance -= amount;
        saveEco(data);
        await ctx.msg.reply({ embeds: [embed("games", "Duel Lost", `You lost the duel. -${fmtCoins(amount)} (balance: ${fmtCoins(acc.balance)}).`)] });
      }
    },
  },
  {
    name: "guess",
    category: "games",
    description: "Guess a number 1-100 (3 tries)",
    usage: "!guess <number>",
    async run(ctx) {
      const secret = rollDice(100);
      await ctx.msg.reply({ embeds: [embed("games", "Number Guess", "I picked a number between 1 and 100. You have 3 tries — reply with your guesses!")] });
      for (let i = 0; i < 3; i++) {
        try {
          const collected = await ctx.msg.channel.awaitMessages({
            filter: (m) => m.author.id === ctx.msg.author.id,
            max: 1,
            time: 30_000,
            errors: ["time"],
          });
          const g = parseInt(collected.first()!.content.trim(), 10);
          if (g === secret) {
            const data = loadEco();
            const acc = getAccount(data, ctx.msg.author.id);
            acc.balance += 100;
            saveEco(data);
            await ctx.msg.channel.send({ embeds: [embed("games", "You Got It!", `**${secret}** was right! +${fmtCoins(100)} reward.`)] });
            return;
          }
          await ctx.msg.channel.send({ embeds: [embed("games", "Wrong", g < secret ? "Higher!" : "Lower!")] });
        } catch {
          await ctx.msg.channel.send({ embeds: [embed("games", "Time's Up", `The number was **${secret}**.`)] });
          return;
        }
      }
      await ctx.msg.channel.send({ embeds: [embed("games", "Out of Tries", `The number was **${secret}**.`)] });
    },
  },
];

export function findCommand(name: string): BotCommand | undefined {
  return commands.find((c) => c.name === name);
}

export function isModerator(msg: Message, isOwner: boolean): boolean {
  if (isOwner) return true;
  const member = msg.member;
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/** Parse a message into (command, args). Returns null when not a command. */
export function parseCommand(content: string): { name: string; args: string[] } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

/** Markdown summary of all commands, injected into the AI agent's system prompt. */
export function commandCatalogPrompt(): string {
  const lines = commands.map((c) => `- ${c.usage}: ${c.description}${c.modOnly ? " (moderators only)" : ""}`);
  return `\n# Discord commands available\nWhen a user asks what commands exist, list them by category (moderation, fun, economy, games). Full list:\n${lines.join("\n")}\n`;
}
