import { base, ok, fail, fmtCoins, rollDice, pick, clampInt, timeLeft } from "./shared.js";
import type { BotCommand } from "./types.js";

const JOBS = [
  "you debugged production for 6 hours", "you worked the fry station", "you sold your old GPU",
  "you freelanced for a suspicious client", "you walked dogs", "you streamed for 12 viewers",
  "you mined crypto during a heatwave", "you flipped a keyboard on eBay",
];
const CRIMES = ["hacked the mainframe", "stole a bot's token", "j-walked in cyberspace", "ate the last donut", "pirated one (1) movie"];
const WORK_FAIL = ["You slipped on a banana peel and lost your shift.", "Your boss caught you on Discord. No pay."];

export const economyCommands: BotCommand[] = [
  { name: "balance", category: "economy", description: "Check your or someone's balance", usage: "!balance [user]", async run(ctx) {
    const id = ctx.msg.mentions.users.first()?.id ?? ctx.msg.author.id;
    const acc = ctx.eco(id);
    await ok(ctx.msg, "economy", "Balance", `<@${id}> has ${fmtCoins(acc.balance)}.`);
  } },
  { name: "daily", category: "economy", description: "Claim your daily reward", usage: "!daily", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - acc.lastDaily < 86_400_000) {
      return void (await fail(ctx.msg, "Daily Claimed", `Already claimed. Come back in **${timeLeft(86_400_000 - (now - acc.lastDaily))}**.`));
    }
    acc.lastDaily = now;
    acc.balance += 250;
    ctx.saveEco();
    const e = base("economy", "Daily Reward", `You claimed **250** :coin:.\nNew balance: ${fmtCoins(acc.balance)}`);
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "weekly", category: "economy", description: "Claim your weekly reward", usage: "!weekly", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.lastWeekly ?? 0) < 7 * 86_400_000) {
      return void (await fail(ctx.msg, "Weekly Claimed", `Already claimed. Come back in **${timeLeft(7 * 86_400_000 - (now - (acc.lastWeekly ?? 0)))}**.`));
    }
    acc.lastWeekly = now;
    acc.balance += 1000;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Weekly Reward", `You claimed **1000** :coin:.\nNew balance: ${fmtCoins(acc.balance)}`);
  } },
  { name: "monthly", category: "economy", description: "Claim your monthly reward", usage: "!monthly", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.lastMonthly ?? 0) < 30 * 86_400_000) {
      return void (await fail(ctx.msg, "Monthly Claimed", `Already claimed. Come back in **${timeLeft(30 * 86_400_000 - (now - (acc.lastMonthly ?? 0)))}**.`));
    }
    acc.lastMonthly = now;
    acc.balance += 5000;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Monthly Reward", `You claimed **5000** :coin:.\nNew balance: ${fmtCoins(acc.balance)}`);
  } },
  { name: "work", category: "economy", description: "Work for coins (1h cooldown)", usage: "!work", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - acc.workCooldown < 3_600_000) {
      return void (await fail(ctx.msg, "Tired", `You're still on break. Back in **${timeLeft(3_600_000 - (now - acc.workCooldown))}**.`));
    }
    acc.workCooldown = now;
    if (Math.random() < 0.1) {
      ctx.saveEco();
      return void (await fail(ctx.msg, "Work Failed", pick(WORK_FAIL)));
    }
    const pay = 20 + rollDice(60);
    acc.balance += pay;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Work", `${pick(JOBS)} and earned ${fmtCoins(pay)}.\nBalance: ${fmtCoins(acc.balance)}`);
  } },
  { name: "crime", category: "economy", description: "Risk it all for coins (5m cooldown)", usage: "!crime", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.crimeCooldown ?? 0) < 300_000) {
      return void (await fail(ctx.msg, "Laying Low", `The heat needs to die down. Wait **${timeLeft(300_000 - (now - (acc.crimeCooldown ?? 0)))}**.`));
    }
    acc.crimeCooldown = now;
    if (Math.random() < 0.5) {
      const fine = Math.min(acc.balance, 50 + rollDice(100));
      acc.balance -= fine;
      ctx.saveEco();
      return void (await fail(ctx.msg, "Busted", `You ${pick(CRIMES)} and got caught. Fine: ${fmtCoins(fine)}.`));
    }
    const loot = 100 + rollDice(200);
    acc.balance += loot;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Crime Pays", `You ${pick(CRIMES)} and got away with ${fmtCoins(loot)}.\nBalance: ${fmtCoins(acc.balance)}`);
  } },
  { name: "rob", category: "economy", description: "Rob another member (risky)", usage: "!rob <user>", async run(ctx) {
    const target = ctx.msg.mentions.users.first();
    if (!target || target.id === ctx.msg.author.id) return void (await fail(ctx.msg, "Usage", "`!rob <user>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    const tAcc = ctx.eco(target.id);
    if (tAcc.balance < 100) return void (await fail(ctx.msg, "Not Worth It", `${target.tag} doesn't have enough coins to rob.`));
    if (Math.random() < 0.55) {
      const stolen = Math.floor(tAcc.balance * 0.2);
      tAcc.balance -= stolen;
      acc.balance += stolen;
      ctx.saveEco();
      await ok(ctx.msg, "economy", "Robbery Success", `You stole ${fmtCoins(stolen)} from ${target.tag}!`);
    } else {
      const fine = Math.min(acc.balance, 100);
      acc.balance -= fine;
      ctx.saveEco();
      await fail(ctx.msg, "Caught Red-Handed", `You got caught and paid ${fmtCoins(fine)} in damages.`);
    }
  } },
  { name: "gamble", category: "economy", description: "Double or nothing", usage: "!gamble <amount>", async run(ctx) {
    const amount = parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(amount) || amount < 1) return void (await fail(ctx.msg, "Usage", "`!gamble <amount>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (amount > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    if (Math.random() < 0.5) {
      acc.balance += amount;
      ctx.saveEco();
      await ok(ctx.msg, "economy", "Gamble Won", `You won ${fmtCoins(amount)}! Balance: ${fmtCoins(acc.balance)}`);
    } else {
      acc.balance -= amount;
      ctx.saveEco();
      await fail(ctx.msg, "Gamble Lost", `You lost ${fmtCoins(amount)}. Balance: ${fmtCoins(acc.balance)}`);
    }
  } },
  { name: "bet", category: "economy", description: "Bet on a coin flip", usage: "!bet <amount> <heads|tails>", async run(ctx) {
    const amount = parseInt(ctx.args[0] ?? "", 10);
    const side = (ctx.args[1] ?? "").toLowerCase();
    if (!Number.isFinite(amount) || amount < 1 || !["heads", "tails"].includes(side)) return void (await fail(ctx.msg, "Usage", "`!bet <amount> <heads|tails>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (amount > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    const result = Math.random() < 0.5 ? "heads" : "tails";
    if (result === side) {
      acc.balance += amount;
      ctx.saveEco();
      await ok(ctx.msg, "economy", "Bet Won", `It was **${result}**! You won ${fmtCoins(amount)}.`);
    } else {
      acc.balance -= amount;
      ctx.saveEco();
      await fail(ctx.msg, "Bet Lost", `It was **${result}**. You lost ${fmtCoins(amount)}.`);
    }
  } },
  { name: "pay", category: "economy", description: "Give coins to someone", usage: "!pay <user> <amount>", async run(ctx) {
    const target = ctx.msg.mentions.users.first();
    const amount = parseInt(ctx.args[1] ?? "", 10);
    if (!target || !Number.isFinite(amount) || amount < 1) return void (await fail(ctx.msg, "Usage", "`!pay <user> <amount>`"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (amount > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    acc.balance -= amount;
    ctx.eco(target.id).balance += amount;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Payment Sent", `You sent ${fmtCoins(amount)} to ${target.tag}.`);
  } },
  { name: "baltop", category: "economy", description: "Richest members", usage: "!baltop", async run(ctx) {
    const lines = ctx.topBalances();
    await ok(ctx.msg, "economy", "Coin Leaderboard", lines.length ? lines.join("\n") : "Nobody has coins yet.");
  } },
  { name: "shop", category: "economy", description: "Browse the item shop", usage: "!shop", async run(ctx) {
    const e = base("economy", "Shop", "Spend your hard-earned coins.");
    ctx.shopItems().forEach((it) => e.addFields({ name: `${it.emoji} ${it.name} — ${it.price} :coin:`, value: it.desc, inline: false }));
    await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  } },
  { name: "buy", category: "economy", description: "Buy an item from the shop", usage: "!buy <item>", async run(ctx) {
    const name = (ctx.args.join(" ") || "").toLowerCase();
    const item = ctx.shopItems().find((i) => i.name.toLowerCase() === name);
    if (!item) return void (await fail(ctx.msg, "Not Found", "That item isn't in the shop. Try `!shop`."));
    const acc = ctx.eco(ctx.msg.author.id);
    if (acc.balance < item.price) return void (await fail(ctx.msg, "Too Broke", `You need ${item.price} :coin: for that.`));
    acc.balance -= item.price;
    (acc.items ??= []).push(item.name);
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Purchase Complete", `You bought **${item.emoji} ${item.name}** for ${item.price} :coin:.\nBalance: ${fmtCoins(acc.balance)}`);
  } },
  { name: "inventory", category: "economy", description: "Show your purchased items", usage: "!inventory", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const items = acc.items ?? [];
    await ok(ctx.msg, "economy", "Inventory", items.length ? items.map((i) => `• ${i}`).join("\n") : "Empty. Go shopping (`!shop`).");
  } },
  { name: "deposit", category: "economy", description: "Deposit coins into your bank", usage: "!deposit <amount|all>", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const amt = ctx.args[0] === "all" ? acc.balance : parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(amt) || amt < 1 || amt > acc.balance) return void (await fail(ctx.msg, "Usage", "`!deposit <amount|all>`"));
    acc.balance -= amt;
    acc.bank = (acc.bank ?? 0) + Math.floor(amt * 1.02);
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Deposited", `Bank: ${fmtCoins(acc.bank ?? 0)} (2% interest applied).`);
  } },
  { name: "withdraw", category: "economy", description: "Withdraw coins from your bank", usage: "!withdraw <amount|all>", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const amt = ctx.args[0] === "all" ? (acc.bank ?? 0) : parseInt(ctx.args[0] ?? "", 10);
    if (!Number.isFinite(amt) || amt < 1 || amt > (acc.bank ?? 0)) return void (await fail(ctx.msg, "Usage", "`!withdraw <amount|all>`"));
    acc.bank = (acc.bank ?? 0) - amt;
    acc.balance += amt;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Withdrawn", `Wallet: ${fmtCoins(acc.balance)}`);
  } },
  { name: "bank", category: "economy", description: "Check your bank balance", usage: "!bank", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    await ok(ctx.msg, "economy", "Bank", `Wallet: ${fmtCoins(acc.balance)}\nBank: ${fmtCoins(acc.bank ?? 0)}`);
  } },
  { name: "steal", category: "economy", description: "Attempt a small heist (10m cooldown)", usage: "!steal", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.stealCooldown ?? 0) < 600_000) return void (await fail(ctx.msg, "On the Run", `Wait **${timeLeft(600_000 - (now - (acc.stealCooldown ?? 0)))}**.`));
    acc.stealCooldown = now;
    if (Math.random() < 0.4) {
      const loot = 50 + rollDice(150);
      acc.balance += loot;
      ctx.saveEco();
      await ok(ctx.msg, "economy", "Heist Success", `You lifted ${fmtCoins(loot)} from a vending machine.`);
    } else {
      const fine = Math.min(acc.balance, 75);
      acc.balance -= fine;
      ctx.saveEco();
      await fail(ctx.msg, "Heist Failed", `Security caught you. Lost ${fmtCoins(fine)}.`);
    }
  } },
  { name: "beg", category: "economy", description: "Beg for coins", usage: "!beg", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    if (Math.random() < 0.3) return void (await fail(ctx.msg, "Begging", pick(["Get a job.", "Even the pigeons ignored you.", "Someone threw a shoe at you."])));
    const got = 5 + rollDice(25);
    acc.balance += got;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Begging", `A kind stranger gave you ${fmtCoins(got)}.`);
  } },
  { name: "fish", category: "economy", description: "Fish for coins (15m cooldown)", usage: "!fish", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.fishCooldown ?? 0) < 900_000) return void (await fail(ctx.msg, "Fished Out", `The pond needs to rest. Wait **${timeLeft(900_000 - (now - (acc.fishCooldown ?? 0)))}**.`));
    acc.fishCooldown = now;
    const catch_ = pick(["🐟 trout", "🐠 tropical fish", "🦈 small shark", "🥾 an old boot", "🦑 squid", "🐋 whale (impressive)"]);
    const value = catch_.includes("boot") ? 5 : 30 + rollDice(120);
    acc.balance += value;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Fishing", `You caught **${catch_}** — worth ${fmtCoins(value)}.`);
  } },
  { name: "hunt", category: "economy", description: "Hunt for coins (15m cooldown)", usage: "!hunt", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.huntCooldown ?? 0) < 900_000) return void (await fail(ctx.msg, "Empty Forest", `The woods are quiet. Wait **${timeLeft(900_000 - (now - (acc.huntCooldown ?? 0)))}**.`));
    acc.huntCooldown = now;
    const game = pick(["🦌 deer", "🐇 rabbit", "🦃 turkey", "🐿️ squirrel (barely a snack)"]);
    const value = 25 + rollDice(100);
    acc.balance += value;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Hunting", `You bagged a **${game}** — worth ${fmtCoins(value)}.`);
  } },
  { name: "dig", category: "economy", description: "Dig for treasure (10m cooldown)", usage: "!dig", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    const now = Date.now();
    if (now - (acc.digCooldown ?? 0) < 600_000) return void (await fail(ctx.msg, "Tired Arms", `Rest those arms. Wait **${timeLeft(600_000 - (now - (acc.digCooldown ?? 0)))}**.`));
    acc.digCooldown = now;
    const found = pick(["💰 a coin pouch", "💎 a small gem", "🪙 old coins", "🪨 a rock (worthless)"]);
    const value = found.includes("rock") ? 1 : 40 + rollDice(150);
    acc.balance += value;
    ctx.saveEco();
    await ok(ctx.msg, "economy", "Digging", `You dug up **${found}** — worth ${fmtCoins(value)}.`);
  } },
  { name: "lottery", category: "economy", description: "Buy a 100-coin lottery ticket", usage: "!lottery", async run(ctx) {
    const acc = ctx.eco(ctx.msg.author.id);
    if (acc.balance < 100) return void (await fail(ctx.msg, "Too Broke", "Tickets cost 100 :coin:."));
    acc.balance -= 100;
    if (rollDice(100) === 1) {
      acc.balance += 5000;
      ctx.saveEco();
      await ok(ctx.msg, "economy", "LOTTERY WINNER", "🎉 You won **5000** :coin:!");
    } else {
      ctx.saveEco();
      await fail(ctx.msg, "Lottery", "Not a winner this time. The house thanks you.");
    }
  } },
  { name: "invest", category: "economy", description: "Invest coins for a random return", usage: "!invest <amount>", async run(ctx) {
    const amount = clampInt(ctx.args[0], 10, 10000, 0);
    if (!amount) return void (await fail(ctx.msg, "Usage", "`!invest <amount>` (min 10)"));
    const acc = ctx.eco(ctx.msg.author.id);
    if (amount > acc.balance) return void (await fail(ctx.msg, "Too Broke", "You don't have that many coins."));
    acc.balance -= amount;
    const mult = 0.5 + Math.random() * 1.5;
    const ret = Math.floor(amount * mult);
    acc.balance += ret;
    ctx.saveEco();
    const delta = ret - amount;
    await (delta >= 0 ? ok : fail)(ctx.msg, "economy", "Investment", `${delta >= 0 ? "Profit" : "Loss"}: ${fmtCoins(Math.abs(delta))} (${(mult * 100).toFixed(0)}% return).\nBalance: ${fmtCoins(acc.balance)}`);
  } },
];