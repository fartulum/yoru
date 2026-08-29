import { PermissionFlagsBits } from "discord.js";
import { base, ok, fail, requirePerm } from "./shared";
import type { BotCommand } from "../types";

/**
 * Verification system: members run !verify to receive the server's verify role.
 * Configurable per guild (role, log channel, welcome message) via commands or the web panel.
 */

export const verifyCommands: BotCommand[] = [
  {
    name: "verify",
    category: "moderation",
    description: "Verify yourself to get access to the server",
    usage: "!verify",
    async run(ctx) {
      const cfg = ctx.verifyConfig(ctx.msg.guildId!);
      if (!cfg.enabled || !cfg.roleId) {
        return void (await fail(ctx.msg, "Verification Disabled", "This server has no verification set up."));
      }
      const role = ctx.msg.guild?.roles.cache.get(cfg.roleId);
      if (!role) {
        return void (await fail(ctx.msg, "Verification Error", "The verify role no longer exists. Ask an admin to re-set it."));
      }
      const member = ctx.msg.member;
      if (!member) return;
      try {
        await member.roles.add(role);
      } catch {
        return void (await fail(ctx.msg, "Verification Error", "I couldn't give you the role. Ask an admin to check my permissions."));
      }
      ctx.markVerified(ctx.msg.author.id);
      ctx.logVerify(ctx.msg.author.id, ctx.msg.author.username);
      await ok(ctx.msg, "Verified", "You're in. Welcome to the server!");
    },
  },
  {
    name: "setverifyrole",
    category: "admin",
    description: "Set the role given on successful verification",
    usage: "!setverifyrole <role>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const role = ctx.msg.mentions.roles.first() ?? ctx.msg.guild?.roles.cache.find((r) => r.name.toLowerCase() === (ctx.args[0] ?? "").toLowerCase());
      if (!role) return void (await fail(ctx.msg, "Usage", "`!setverifyrole <role>`"));
      ctx.setVerifyRole(role.id);
      await ok(ctx.msg, "admin", "Verify Role Set", `Members who pass verification now receive **${role.name}**.`);
    },
  },
  {
    name: "toggleverify",
    category: "admin",
    description: "Enable or disable the verification system",
    usage: "!toggleverify <on|off>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const arg = (ctx.args[0] ?? "").toLowerCase();
      if (!["on", "off"].includes(arg)) {
        return void (await fail(ctx.msg, "Usage", "`!toggleverify <on|off>`"));
      }
      const on = arg === "on";
      ctx.setVerifyEnabled(on);
      await ok(ctx.msg, "admin", "Verification " + (on ? "Enabled" : "Disabled"), on ? "Members can now use `!verify`." : "Verification is off.");
    },
  },
  {
    name: "verifylog",
    category: "admin",
    description: "Set the channel where verifications are logged",
    usage: "!verifylog <channel>",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const ch = ctx.msg.mentions.channels.first();
      if (!ch) return void (await fail(ctx.msg, "Usage", "`!verifylog <channel>`"));
      ctx.setVerifyLog(ch.id);
      await ok(ctx.msg, "admin", "Verify Log Set", `Verifications will be logged in <#${ch.id}>.`);
    },
  },
  {
    name: "verifyconfig",
    category: "admin",
    description: "Show the verification configuration",
    usage: "!verifyconfig",
    perm: PermissionFlagsBits.Administrator,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.Administrator);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const cfg = ctx.verifyConfig(ctx.msg.guildId!);
      const e = base("admin", "Verification Config");
      e.addFields(
        { name: "Enabled", value: cfg.enabled ? "yes" : "no", inline: true },
        { name: "Role", value: cfg.roleId ? `<@&${cfg.roleId}>` : "(not set)", inline: true },
        { name: "Log channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "(not set)", inline: true },
        { name: "Verified members", value: String(cfg.verifiedCount ?? 0), inline: true },
      );
      await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
    },
  },
];
