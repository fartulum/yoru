import { base, ok, fail, clampInt, pick, ch } from "./shared.js";
import type { BotCommand } from "./types.js";

const EMOJIS = ["😀", "😎", "🤖", "🔥", "💎", "🚀", "🌙", "⭐", "🎮", "🍕", "🎧", "🦊"];

export const utilityCommands: BotCommand[] = [
  { name: "help", category: "core", description: "List all commands, optionally by category", usage: "!help [category]", async run(ctx) {
    const cat = ctx.args[0]?.toLowerCase();
    const all = ctx.allCommands();
    const list = cat && cat !== "all" ? all.filter((c) => c.category === cat) : all;
    const e = base("core", cat && cat !== "all" ? `**${cat}** commands` : "Command List", `${all.length} commands available. Use \`${ctx.prefix}help <category>\` to filter.\nCategories: moderation, admin, fun, economy, games, utility, info, core`);
    const byCat = new Map<string, typeof list>();
    for (const c of list) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
    for (const [category, cmds] of byCat) {
      e.addFields({ name: `${category} (${cmds.length})`, value: cmds.map((c) => `\`${c.usage}\``).join(" · ").slice(0, 1024), inline: false });
    }
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "ping", category: "info", description: "Check bot latency", usage: "!ping", async run(ctx) {
    const sent = await ctx.msg.reply({ embeds: [base("info", "Pong!", "Measuring...")], allowedMentions: { repliedUser: false } });
    const ms = sent.createdTimestamp - ctx.msg.createdTimestamp;
    await sent.edit({ embeds: [base("info", "Pong! 🏓", `Roundtrip: **${ms}ms**\nAPI: **${ctx.msg.client.ws.ping}ms**`)] });
  } },
  { name: "uptime", category: "info", description: "How long the bot has been running", usage: "!uptime", async run(ctx) {
    const s = process.uptime();
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    await ok(ctx.msg, "info", "Uptime", `Online for **${d}d ${h}h ${m}m**.`);
  } },
  { name: "invite", category: "info", description: "Bot invite link", usage: "!invite", async run(ctx) {
    await ok(ctx.msg, "info", "Invite Me", `[Add yoru to your server](https://discord.com/oauth2/authorize?client_id=${ctx.msg.client.user?.id}&permissions=8&scope=bot)`);
  } },
  { name: "support", category: "info", description: "Where to get help", usage: "!support", async run(ctx) {
    await ok(ctx.msg, "info", "Support", "Ping the bot owner or open an issue on the yoru repo.");
  } },
  { name: "vote", category: "info", description: "Support the bot", usage: "!vote", async run(ctx) {
    await ok(ctx.msg, "info", "Vote", "Voting links coming soon. For now, just invite your friends.");
  } },
  { name: "stats", category: "info", description: "Bot statistics", usage: "!stats", async run(ctx) {
    const e = base("info", "Bot Statistics");
    e.addFields(
      { name: "Servers", value: `${ctx.msg.client.guilds.cache.size}`, inline: true },
      { name: "Users", value: `${ctx.msg.client.users.cache.size}`, inline: true },
      { name: "Commands", value: `${ctx.allCommands().length}`, inline: true },
      { name: "Uptime", value: `${Math.floor(process.uptime() / 3600)}h`, inline: true },
    );
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "prefix", category: "info", description: "Show the current command prefix", usage: "!prefix", async run(ctx) {
    await ok(ctx.msg, "info", "Prefix", `The prefix for this server is \`${ctx.prefix}\`.`);
  } },
  { name: "remind", category: "utility", description: "Set a reminder (minutes)", usage: "!remind <minutes> <message>", async run(ctx) {
    const mins = clampInt(ctx.args[0], 1, 10080, 0);
    const text = ctx.args.slice(1).join(" ");
    if (!mins || !text) return void (await fail(ctx.msg, "Usage", "`!remind <minutes> <message>`"));
    setTimeout(async () => {
      await ch(ctx.msg).send({ embeds: [base("utility", "Reminder", `${ctx.msg.author}, you asked me to remind you:\n> ${text}`)] }).catch(() => {});
    }, mins * 60_000);
    await ok(ctx.msg, "utility", "Reminder Set", `I'll ping you in **${mins} min**.`);
  } },
  { name: "calc", category: "utility", description: "Evaluate a math expression", usage: "!calc <expression>", async run(ctx) {
    const expr = ctx.args.join(" ").replace(/[^0-9+\-*/().% ]/g, "");
    if (!expr) return void (await fail(ctx.msg, "Usage", "`!calc <expression>`"));
    try {
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result !== "number" || !Number.isFinite(result)) throw new Error();
      await ok(ctx.msg, "utility", "Calculator", `**${expr}** = **${result}**`);
    } catch {
      await fail(ctx.msg, "Calculator", "That expression can't be evaluated.");
    }
  } },
  { name: "convert", category: "utility", description: "Convert units (km/mi, kg/lb, c/f)", usage: "!convert <value> <unit> <to>", async run(ctx) {
    const v = parseFloat(ctx.args[0] ?? "");
    const from = (ctx.args[1] ?? "").toLowerCase(), to = (ctx.args[2] ?? "").toLowerCase();
    if (!Number.isFinite(v)) return void (await fail(ctx.msg, "Usage", "`!convert <value> <unit> <to>` e.g. `!convert 10 km mi`"));
    const table: Record<string, Record<string, number | ((x: number) => number)>> = {
      km: { mi: 0.621371, m: 1000 },
      mi: { km: 1.60934 },
      kg: { lb: 2.20462 },
      lb: { kg: 0.453592 },
      c: { f: (x: number) => x * 9 / 5 + 32 },
      f: { c: (x: number) => (x - 32) * 5 / 9 },
    };
    const conv = table[from]?.[to];
    if (conv === undefined) return void (await fail(ctx.msg, "Unsupported", "Try km↔mi, kg↔lb or c↔f."));
    const result = typeof conv === "function" ? conv(v) : v * conv;
    await ok(ctx.msg, "utility", "Conversion", `**${v} ${from}** = **${result.toFixed(2)} ${to}**`);
  } },
  { name: "poll2", category: "utility", description: "Multi-option poll", usage: "!poll2 <question> | <opt1> | <opt2> | ...", async run(ctx) {
    const parts = ctx.args.join(" ").split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return void (await fail(ctx.msg, "Usage", "`!poll2 <question> | <opt1> | <opt2> | ...`"));
    const [q, ...opts] = parts;
    const e = base("utility", "Poll", q);
    opts.slice(0, 10).forEach((o, i) => e.addFields({ name: `${EMOJIS[i]} Option ${i + 1}`, value: o, inline: true }));
    const m = await ch(ctx.msg).send({ embeds: [e] });
    for (let i = 0; i < Math.min(opts.length, 10); i++) await m.react(EMOJIS[i]).catch(() => {});
  } },
  { name: "weather", category: "utility", description: "Weather placeholder (needs API key)", usage: "!weather <city>", async run(ctx) {
    await fail(ctx.msg, "Weather", "Weather needs an API key — set `WEATHER_API_KEY` in .env to enable it.");
  } },
  { name: "define", category: "utility", description: "Define a word (AI-powered)", usage: "!define <word>", async run(ctx) {
    const w = ctx.args.join(" ");
    if (!w) return void (await fail(ctx.msg, "Usage", "`!define <word>`"));
    await ok(ctx.msg, "utility", `Define: ${w}`, "Ask the AI agent directly — mention it and say 'define <word>'.");
  } },
  { name: "translate", category: "utility", description: "Translate text (AI-powered)", usage: "!translate <lang> <text>", async run(ctx) {
    await fail(ctx.msg, "Translate", "Translation is handled by the AI agent — mention it with your text and target language.");
  } },
  { name: "shorten", category: "utility", description: "Shorten a URL", usage: "!shorten <url>", async run(ctx) {
    await fail(ctx.msg, "Shorten", "URL shortening needs an API key — set `SHORTENER_API_KEY` in .env to enable it.");
  } },
  { name: "afk", category: "utility", description: "Set yourself AFK", usage: "!afk [reason]", async run(ctx) {
    ctx.setAfk(ctx.msg.author.id, ctx.args.join(" ") || "AFK");
    await ok(ctx.msg, "utility", "AFK Set", `${ctx.msg.author.tag} is now AFK: **${ctx.args.join(" ") || "AFK"}**`);
  } },
  { name: "afklist", category: "utility", description: "List AFK members", usage: "!afklist", async run(ctx) {
    const list = ctx.afkList();
    await ok(ctx.msg, "utility", "AFK Members", list.length ? list.join("\n") : "Nobody is AFK.");
  } },
  { name: "quoteadd", category: "utility", description: "Save a quote to the server's quote list", usage: "!quoteadd <text>", async run(ctx) {
    const text = ctx.args.join(" ");
    if (!text) return void (await fail(ctx.msg, "Usage", "`!quoteadd <text>`"));
    ctx.addQuote(`${ctx.msg.author.tag}: ${text}`);
    await ok(ctx.msg, "utility", "Quote Saved", "Added to this server's quote list.");
  } },
  { name: "quoteget", category: "utility", description: "Get a random saved quote", usage: "!quoteget", async run(ctx) {
    const q = ctx.randomQuote();
    await ok(ctx.msg, "utility", "Random Quote", q ?? "No quotes saved yet. Use `!quoteadd`.");
  } },
  { name: "todo", category: "utility", description: "Add to your personal todo list", usage: "!todo <task>", async run(ctx) {
    const text = ctx.args.join(" ");
    if (!text) return void (await fail(ctx.msg, "Usage", "`!todo <task>`"));
    ctx.addTodo(ctx.msg.author.id, text);
    await ok(ctx.msg, "utility", "Todo Added", `**${text}** — use \`!todolist\` to view.`);
  } },
  { name: "todolist", category: "utility", description: "Show your todo list", usage: "!todolist", async run(ctx) {
    const list = ctx.todos(ctx.msg.author.id);
    await ok(ctx.msg, "utility", "Your Todos", list.length ? list.map((t, i) => `${i + 1}. ${t}`).join("\n") : "Nothing on your list.");
  } },
  { name: "tododone", category: "utility", description: "Remove a todo by number", usage: "!tododone <number>", async run(ctx) {
    const n = clampInt(ctx.args[0], 1, 999, 0);
    const done = ctx.removeTodo(ctx.msg.author.id, n - 1);
    await (done ? ok : fail)(ctx.msg, "utility", "Todo", done ? "Marked as done. Nice." : "No todo with that number.");
  } },
  { name: "snipe", category: "utility", description: "Show the last deleted message in this channel", usage: "!snipe", async run(ctx) {
    const s = ctx.snipe(ctx.msg.channel.id);
    if (!s) return void (await fail(ctx.msg, "Snipe", "Nothing to snipe."));
    await ctx.msg.reply({ embeds: [base("utility", "Sniped", `**${s.author}:** ${s.content}`).setFooter({ text: "deleted message" })], allowedMentions: { repliedUser: false } });
  } },
  { name: "editsnipe", category: "utility", description: "Show the last edited message in this channel", usage: "!editsnipe", async run(ctx) {
    const s = ctx.editSnipe(ctx.msg.channel.id);
    if (!s) return void (await fail(ctx.msg, "Edit Snipe", "Nothing to snipe."));
    await ctx.msg.reply({ embeds: [base("utility", "Edit Sniped", `**${s.author}:** ${s.content}`)], allowedMentions: { repliedUser: false } });
  } },
  { name: "avatarurl", category: "utility", description: "Get a user's avatar URL", usage: "!avatarurl [user]", async run(ctx) {
    const u = ctx.msg.mentions.users.first() ?? ctx.msg.author;
    await ok(ctx.msg, "utility", "Avatar URL", u.displayAvatarURL({ size: 1024 }));
  } },
  { name: "firstmsg", category: "utility", description: "Link the first message of the channel", usage: "!firstmsg", async run(ctx) {
    await fail(ctx.msg, "First Message", "This command needs ManageMessages permission to fetch history.");
  } },
  { name: "roleinfo", category: "utility", description: "Show info about a role", usage: "!roleinfo <role>", async run(ctx) {
    const role = ctx.msg.mentions.roles.first() ?? ctx.msg.guild?.roles.cache.find((r) => r.name.toLowerCase() === ctx.args.join(" ").toLowerCase());
    if (!role) return void (await fail(ctx.msg, "Usage", "`!roleinfo <role>`"));
    const e = base("utility", `@${role.name}`);
    e.addFields(
      { name: "Members", value: `${role.members.size}`, inline: true },
      { name: "Color", value: role.hexColor, inline: true },
      { name: "Position", value: `${role.position}`, inline: true },
      { name: "Created", value: `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`, inline: true },
    );
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "channelinfo", category: "utility", description: "Show info about this channel", usage: "!channelinfo", async run(ctx) {
    const ch = ctx.msg.channel as any;
    const e = base("utility", `#${ch.name ?? "channel"}`);
    e.addFields(
      { name: "Type", value: `${ch.type}`, inline: true },
      { name: "ID", value: `${ch.id}`, inline: true },
      { name: "Created", value: `<t:${Math.floor(ch.createdTimestamp / 1000)}:D>`, inline: true },
    );
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "serverbanner", category: "utility", description: "Show the server banner", usage: "!serverbanner", async run(ctx) {
    const g = ctx.msg.guild!;
    const banner = (await g.fetch()).bannerURL?.();
    if (!banner) return void (await fail(ctx.msg, "No Banner", "This server has no banner."));
    await ctx.msg.reply({ embeds: [base("utility", `${g.name}'s Banner`).setImage(banner)], allowedMentions: { repliedUser: false } });
  } },
  { name: "listroles", category: "utility", description: "List all roles in the server", usage: "!listroles", async run(ctx) {
    const roles = [...ctx.msg.guild!.roles.cache.values()].sort((a, b) => b.position - a.position).slice(0, 20);
    await ok(ctx.msg, "utility", "Server Roles", roles.map((r) => `${r} (${r.members.size})`).join("\n"));
  } },
  { name: "emojilist", category: "utility", description: "List custom emojis", usage: "!emojilist", async run(ctx) {
    const emojis = [...ctx.msg.guild!.emojis.cache.values()].slice(0, 30);
    await ok(ctx.msg, "utility", "Custom Emojis", emojis.length ? emojis.map((e) => `${e} \`${e.name}\``).join("\n") : "No custom emojis.");
  } },
  { name: "membercount", category: "utility", description: "Show member count", usage: "!membercount", async run(ctx) {
    const g = ctx.msg.guild!;
    await ok(ctx.msg, "utility", "Member Count", `**${g.memberCount}** members.`);
  } },
  { name: "boostcount", category: "utility", description: "Show server boost level", usage: "!boostcount", async run(ctx) {
    const g = ctx.msg.guild!;
    await ok(ctx.msg, "utility", "Boosts", `Level **${g.premiumTier}** with **${g.premiumSubscriptionCount ?? 0}** boosts.`);
  } },
  { name: "id", category: "utility", description: "Get a user's ID", usage: "!id [user]", async run(ctx) {
    const u = ctx.msg.mentions.users.first() ?? ctx.msg.author;
    await ok(ctx.msg, "utility", "User ID", `${u.tag}: \`${u.id}\``);
  } },
  { name: "myperms", category: "utility", description: "Show your permissions here", usage: "!myperms", async run(ctx) {
    const m = ctx.msg.member as any;
    const perms = m?.permissions?.toArray?.() ?? [];
    await ok(ctx.msg, "utility", "Your Permissions", perms.length ? perms.map((p: string) => `\`${p}\``).join(" · ").slice(0, 1000) : "None.");
  } },
  { name: "randomemoji", category: "utility", description: "Get a random emoji", usage: "!randomemoji", async run(ctx) {
    await ok(ctx.msg, "utility", "Random Emoji", pick(EMOJIS));
  } },
  { name: "dicehelp", category: "utility", description: "Explain dice notation", usage: "!dicehelp", async run(ctx) {
    await ok(ctx.msg, "utility", "Dice Notation", "`!roll 20` — roll a d20\n`!dice 2d6` — roll two d6 and sum\n`!diceroll` — quick 2d6");
  } },
];