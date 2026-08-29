import { PermissionFlagsBits } from "discord.js";
import { base, ok, fail, resolveMember, canModerate, requirePerm, clampInt, pick } from "./shared.js";
import type { CommandContext, BotCommand } from "./types.js";

const REASONS = [
  "The ban hammer has spoken.",
  "Requested by moderation.",
  "Violation of server rules.",
  "Ask them when the cooldown expires.",
];

export const moderationCommands: BotCommand[] = [
  {
    name: "ban",
    category: "moderation",
    description: "Ban a member from the server",
    usage: "!ban <user> [reason]",
    perm: PermissionFlagsBits.BanMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.BanMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Ban", hErr));
      const reason = ctx.args.slice(1).join(" ") || pick(REASONS);
      await target.ban({ reason: `!ban by ${ctx.msg.author.tag}: ${reason}` });
      await ok(ctx.msg, "moderation", "Member Banned", `${target.user.tag} has been banned.\n**Reason:** ${reason}`);
    },
  },
  {
    name: "softban",
    category: "moderation",
    description: "Ban then immediately unban to purge messages",
    usage: "!softban <user> [reason]",
    perm: PermissionFlagsBits.BanMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.BanMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Softban", hErr));
      const reason = ctx.args.slice(1).join(" ") || "softban (message purge)";
      await target.ban({ reason, deleteMessageSeconds: 604800 });
      await ctx.msg.guild?.members.unban(target.id).catch(() => {});
      await ok(ctx.msg, "moderation", "Member Softbanned", `${target.user.tag} was softbanned (messages purged, can rejoin).`);
    },
  },
  {
    name: "unban",
    category: "moderation",
    description: "Unban a user by ID",
    usage: "!unban <userId>",
    perm: PermissionFlagsBits.BanMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.BanMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const id = ctx.args[0];
      if (!/^\d{17,20}$/.test(id ?? "")) return void (await fail(ctx.msg, "Usage", "`!unban <userId>`"));
      await ctx.msg.guild?.members.unban(id).catch(() => {});
      await ok(ctx.msg, "moderation", "User Unbanned", `<@${id}> has been unbanned.`);
    },
  },
  {
    name: "kick",
    category: "moderation",
    description: "Kick a member from the server",
    usage: "!kick <user> [reason]",
    perm: PermissionFlagsBits.KickMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.KickMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Kick", hErr));
      const reason = ctx.args.slice(1).join(" ") || "No reason provided";
      await target.kick(`!kick by ${ctx.msg.author.tag}: ${reason}`);
      await ok(ctx.msg, "moderation", "Member Kicked", `${target.user.tag} has been kicked.\n**Reason:** ${reason}`);
    },
  },
  {
    name: "timeout",
    category: "moderation",
    description: "Timeout a member (minutes)",
    usage: "!timeout <user> <minutes> [reason]",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Timeout", hErr));
      const minutes = clampInt(ctx.args[1], 1, 40320, 10);
      await target.timeout(minutes * 60_000, ctx.args.slice(2).join(" ") || "Timeout via command");
      await ok(ctx.msg, "moderation", "Member Timed Out", `${target.user.tag} timed out for **${minutes} min**.`);
    },
  },
  {
    name: "untimeout",
    category: "moderation",
    description: "Remove a timeout from a member",
    usage: "!untimeout <user>",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Untimeout", hErr));
      await target.timeout(null);
      await ok(ctx.msg, "moderation", "Timeout Removed", `${target.user.tag} can talk again.`);
    },
  },
  {
    name: "clear",
    category: "moderation",
    description: "Bulk delete messages (2-100)",
    usage: "!clear <count>",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const count = clampInt(ctx.args[0], 2, 100, 10);
      const deleted = await ctx.msg.channel.bulkDelete(count, true);
      await ctx.msg.channel.send({
        embeds: [base("moderation", "Messages Cleared", `**${deleted.size}** messages deleted.`)],
      });
    },
  },
  {
    name: "purgeuser",
    category: "moderation",
    description: "Delete a member's recent messages (up to 100)",
    usage: "!purgeuser <user> [count]",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      if (!target) return void (await fail(ctx.msg, "Usage", "`!purgeuser <user> [count]`"));
      const count = clampInt(ctx.args[1], 1, 100, 50);
      const msgs = await ctx.msg.channel.messages.fetch({ limit: 100 });
      const theirs = msgs.filter((m) => m.author.id === target.id).first(count);
      if (theirs.length) await ctx.msg.channel.bulkDelete(theirs, true);
      await ctx.msg.channel.send({
        embeds: [base("moderation", "Purged", `Deleted **${theirs.length}** messages from ${target.user.tag}.`)],
      });
    },
  },
  {
    name: "slowmode",
    category: "moderation",
    description: "Set channel slowmode (seconds)",
    usage: "!slowmode <seconds>",
    perm: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageChannels);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const secs = clampInt(ctx.args[0], 0, 21600, 0);
      if (ctx.msg.channel.isTextBased() && "setRateLimitPerUser" in ctx.msg.channel) {
        await (ctx.msg.channel as any).setRateLimitPerUser(secs);
      }
      await ok(ctx.msg, "moderation", "Slowmode", secs === 0 ? "Slowmode disabled." : `Slowmode set to **${secs}s**.`);
    },
  },
  {
    name: "warn",
    category: "moderation",
    description: "Warn a member (logged to data/warns.json)",
    usage: "!warn <user> <reason>",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Warn", hErr));
      const reason = ctx.args.slice(1).join(" ");
      if (!reason) return void (await fail(ctx.msg, "Usage", "`!warn <user> <reason>`"));
      const warns = ctx.warns(target.id);
      warns.push({ by: ctx.msg.author.id, reason, at: Date.now() });
      ctx.saveWarns();
      await ok(ctx.msg, "moderation", "Member Warned", `${target.user.tag} warned (**${warns.length}** total).\n**Reason:** ${reason}`);
    },
  },
  {
    name: "warns",
    category: "moderation",
    description: "List a member's warnings",
    usage: "!warns <user>",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      if (!target) return void (await fail(ctx.msg, "Usage", "`!warns <user>`"));
      const warns = ctx.warns(target.id);
      const e = base("moderation", `Warnings for ${target.user.tag}`, warns.length ? undefined : "Clean record.");
      warns.slice(-10).forEach((w, i) => e.addFields({ name: `#${warns.length - i}`, value: `<@${w.by}>: ${w.reason}`, inline: false }));
      await ctx.msg.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
    },
  },
  {
    name: "clearwarns",
    category: "moderation",
    description: "Clear a member's warnings",
    usage: "!clearwarns <user>",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      if (!target) return void (await fail(ctx.msg, "Usage", "`!clearwarns <user>`"));
      ctx.clearWarns(target.id);
      await ok(ctx.msg, "moderation", "Warnings Cleared", `${target.user.tag}'s record is now clean.`);
    },
  },
  {
    name: "mute",
    category: "moderation",
    description: "Timeout a member for 60 minutes",
    usage: "!mute <user> [reason]",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Mute", hErr));
      await target.timeout(60 * 60_000, ctx.args.slice(1).join(" ") || "muted");
      await ok(ctx.msg, "moderation", "Member Muted", `${target.user.tag} muted for **60 min**.`);
    },
  },
  {
    name: "unmute",
    category: "moderation",
    description: "Remove a member's timeout",
    usage: "!unmute <user>",
    perm: PermissionFlagsBits.ModerateMembers,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ModerateMembers);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Unmute", hErr));
      await target.timeout(null);
      await ok(ctx.msg, "moderation", "Member Unmuted", `${target.user.tag} unmuted.`);
    },
  },
  {
    name: "lock",
    category: "moderation",
    description: "Lock the current channel",
    usage: "!lock [reason]",
    perm: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageChannels);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      await ctx.msg.channel.permissionOverwrites.edit(ctx.msg.guild!.id, { SendMessages: false });
      await ok(ctx.msg, "moderation", "Channel Locked", ctx.args.join(" ") || "Only staff can send messages here.");
    },
  },
  {
    name: "unlock",
    category: "moderation",
    description: "Unlock the current channel",
    usage: "!unlock",
    perm: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageChannels);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      await ctx.msg.channel.permissionOverwrites.edit(ctx.msg.guild!.id, { SendMessages: null });
      await ok(ctx.msg, "moderation", "Channel Unlocked", "Everyone can send messages again.");
    },
  },
  {
    name: "nick",
    category: "moderation",
    description: "Change a member's nickname",
    usage: "!nick <user> <nickname>",
    perm: PermissionFlagsBits.ManageNicknames,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageNicknames);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const target = await resolveMember(ctx.msg, ctx.args[0]);
      const hErr = canModerate(ctx.msg, target);
      if (hErr) return void (await fail(ctx.msg, "Cannot Rename", hErr));
      const nick = ctx.args.slice(1).join(" ");
      await target.setNickname(nick || null);
      await ok(ctx.msg, "moderation", "Nickname Changed", `${target.user.tag} is now **${nick || target.user.username}**.`);
    },
  },
  {
    name: "announce",
    category: "moderation",
    description: "Send a styled announcement embed",
    usage: "!announce <message>",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const text = ctx.args.join(" ");
      if (!text) return void (await fail(ctx.msg, "Usage", "`!announce <message>`"));
      await ctx.msg.channel.send({ embeds: [base("moderation", "Announcement", text).setColor(0x00b0f4)] });
    },
  },
  {
    name: "poll",
    category: "moderation",
    description: "Create a yes/no poll with reactions",
    usage: "!poll <question>",
    perm: PermissionFlagsBits.ManageMessages,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageMessages);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const q = ctx.args.join(" ");
      if (!q) return void (await fail(ctx.msg, "Usage", "`!poll <question>`"));
      const m = await ctx.msg.channel.send({ embeds: [base("moderation", "Poll", q).setColor(0x00b0f4)] });
      await m.react("👍");
      await m.react("👎");
    },
  },
  {
    name: "nuke",
    category: "moderation",
    description: "Clone and delete the current channel (destructive)",
    usage: "!nuke",
    perm: PermissionFlagsBits.ManageChannels,
    async run(ctx) {
      const gate = requirePerm(ctx.msg, PermissionFlagsBits.ManageChannels);
      if (gate) return void (await fail(ctx.msg, "Permission Denied", gate));
      const ch = ctx.msg.channel as any;
      if (!ch.clone) return void (await fail(ctx.msg, "Error", "This channel can't be nuked."));
      const pos = ch.position;
      const parent = ch.parentId;
      const clone = await ch.clone();
      await clone.setParent(parent);
      await clone.setPosition(pos);
      await ch.delete();
      await clone.send({ embeds: [base("moderation", "Channel Nuked", "This channel was nuked and rebuilt. 💥")] });
    },
  },
];