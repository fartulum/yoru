import { PermissionFlagsBits } from "discord.js";
import { base, ok, fail, requirePerm, clampInt, pick } from "./shared.js";
import type { BotCommand } from "./types.js";

export const adminCommands: BotCommand[] = [
  {
    name: "setprefix",
    category: "admin",
    description: "Set the command prefix for this server",
    usage: "!setprefix <prefix>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const p = ctx.args[0];
      if (!p || p.length > 5) return void (await fail(ctx.msg, "Usage", "`!setprefix <prefix>` (max 5 chars)"));
      ctx.setPrefix(p);
      await ok(ctx.msg, "admin", "Prefix Updated", `Command prefix is now \`${p}\`.`);
    },
  },
  {
    name: "setwelcome",
    category: "admin",
    description: "Set the welcome message for this server",
    usage: "!setwelcome <message>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const text = ctx.args.join(" ");
      if (!text) return void (await fail(ctx.msg, "Usage", "`!setwelcome <message>` (use {user} and {server})"));
      ctx.setWelcome(text);
      await ok(ctx.msg, "admin", "Welcome Message Set", `New members will see:\n> ${text}`);
    },
  },
  {
    name: "autorole",
    category: "admin",
    description: "Set a role automatically given to new members",
    usage: "!autorole <role>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const role = ctx.msg.mentions.roles.first() ?? ctx.msg.guild?.roles.cache.find((r) => r.name.toLowerCase() === (ctx.args[0] ?? "").toLowerCase());
      if (!role) return void (await fail(ctx.msg, "Usage", "`!autorole <role>`"));
      ctx.setAutoRole(role.id);
      await ok(ctx.msg, "admin", "Auto-Role Set", `New members will receive **${role.name}**.`);
    },
  },
  {
    name: "goodbye",
    category: "admin",
    description: "Set the leave message for this server",
    usage: "!goodbye <message>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const text = ctx.args.join(" ");
      if (!text) return void (await fail(ctx.msg, "Usage", "`!goodbye <message>`"));
      ctx.setGoodbye(text);
      await ok(ctx.msg, "admin", "Goodbye Message Set", `Leaving members will be announced.`);
    },
  },
  {
    name: "warnthreshold",
    category: "admin",
    description: "Auto-timeout members after N warnings",
    usage: "!warnthreshold <count>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const n = clampInt(ctx.args[0], 1, 50, 3);
      ctx.setWarnThreshold(n);
      await ok(ctx.msg, "admin", "Warn Threshold Set", `Members will be timed out after **${n}** warnings.`);
    },
  },
  {
    name: "ecoconfig",
    category: "admin",
    description: "Show economy configuration",
    usage: "!ecoconfig",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const e = base("admin", "Economy Configuration");
      e.addFields(
        { name: "Daily reward", value: "250 :coin:", inline: true },
        { name: "Work pay", value: "20-80 :coin:", inline: true },
        { name: "Daily cooldown", value: "24h", inline: true },
        { name: "Work cooldown", value: "1h", inline: true },
      );
      await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
    },
  },
  {
    name: "botstats",
    category: "admin",
    description: "Show bot uptime, memory and server count",
    usage: "!botstats",
    async run(ctx) {
      const up = process.uptime();
      const h = Math.floor(up / 3600);
      const m = Math.floor((up % 3600) / 60);
      const e = base("admin", "Bot Statistics");
      e.addFields(
        { name: "Uptime", value: `${h}h ${m}m`, inline: true },
        { name: "Servers", value: `${ctx.msg.client.guilds.cache.size}`, inline: true },
        { name: "Memory", value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
        { name: "Node", value: process.version, inline: true },
      );
      await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
    },
  },
  {
    name: "say",
    category: "admin",
    description: "Make the bot send a message",
    usage: "!say <message>",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const text = ctx.args.join(" ");
      if (!text) return void (await fail(ctx.msg, "Usage", "`!say <message>`"));
      await ctx.msg.channel.send({ content: text });
      await ctx.msg.delete().catch(() => {});
    },
  },
  {
    name: "embed",
    category: "admin",
    description: "Make the bot send an embed",
    usage: "!embed <message>",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const text = ctx.args.join(" ");
      if (!text) return void (await fail(ctx.msg, "Usage", "`!embed <message>`"));
      await ctx.msg.channel.send({ embeds: [base("admin", "Message", text)] });
      await ctx.msg.delete().catch(() => {});
    },
  },
  {
    name: "dm",
    category: "admin",
    description: "Send a member a DM from the bot",
    usage: "!dm <user> <message>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = ctx.msg.mentions.users.first();
      const text = ctx.args.slice(1).join(" ");
      if (!target || !text) return void (await fail(ctx.msg, "Usage", "`!dm <user> <message>`"));
      await target.send({ embeds: [base("admin", `Message from ${ctx.msg.guild?.name ?? "a server"}`, text)] });
      await ok(ctx.msg, "admin", "DM Sent", `Delivered to ${target.tag}.`);
    },
  },
];