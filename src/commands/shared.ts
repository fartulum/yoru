import { EmbedBuilder, PermissionFlagsBits, type GuildMember, type Message, type TextChannel } from "discord.js";

/**
 * Shared embed styling + permission helpers for the Discord bot.
 * Every command reply goes through `base()` so the whole bot looks consistent.
 */

export const BRAND = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  info: 0x00b0f4,
  gold: 0xf0b232,
  dark: 0x2b2d31,
};

export const CATEGORY_COLORS: Record<string, number> = {
  moderation: BRAND.danger,
  admin: BRAND.dark,
  fun: 0xf47fff,
  economy: 0x57f287,
  games: 0xfee75c,
  utility: BRAND.info,
  info: BRAND.primary,
  core: BRAND.primary,
};

export function base(category: string, title: string, description?: string): EmbedBuilder {
  const e = new EmbedBuilder()
    .setColor(CATEGORY_COLORS[category] ?? BRAND.primary)
    .setTitle(title)
    .setTimestamp(new Date())
    .setFooter({ text: "yoru", iconURL: undefined });
  if (description) e.setDescription(description);
  return e;
}

export function ok(msg: Message, category: string, title: string, description: string) {
  return msg.reply({
    embeds: [base(category, title, description)],
    allowedMentions: { repliedUser: false },
  });
}

export function fail(msg: Message, title: string, description: string) {
  return msg.reply({
    embeds: [base("core", title, description).setColor(BRAND.danger)],
    allowedMentions: { repliedUser: false },
  });
}

/** Resolve a target member from a mention, name, or id. */
export async function resolveMember(msg: Message, query?: string): Promise<GuildMember | undefined> {
  if (!query) return undefined;
  const mention = msg.mentions.members?.first();
  if (mention) return mention;
  if (/^\d{17,20}$/.test(query)) return await msg.guild?.members.fetch(query).catch(() => undefined);
  const list = await msg.guild?.members.fetch().catch(() => undefined);
  return list?.find((m) => m.user.username.toLowerCase() === query.toLowerCase() || m.displayName.toLowerCase() === query.toLowerCase());
}

/** Permission gate: returns an error message when the member lacks `perm`. */
export function requirePerm(msg: Message, perm: bigint): string | null {
  const member = msg.member;
  if (!member) return "This command only works in a server.";
  const m = member as any;
  if (m.permissions?.has?.(PermissionFlagsBits.Administrator)) return null;
  if (!m.permissions?.has?.(perm)) return "You don't have permission to use this command.";
  return null;
}

/** Hierarchy gate for moderation targets. */
export function canModerate(msg: Message, target: GuildMember | undefined): string | null {
  if (!target) return "Mention a valid user.";
  if (target.id === msg.author.id) return "You can't target yourself.";
  if (target.id === msg.client.user?.id) return "I'm not going to moderate myself.";
  const me = msg.guild?.members.me;
  if (target.roles?.highest && me?.roles?.highest && target.roles.highest.position >= me.roles.highest.position)
    return "I can't act on that member (role hierarchy).";
  const actor = msg.member as any;
  if (actor?.roles?.highest && target.roles?.highest && target.roles.highest.position >= actor.roles.highest.position)
    return "You can't act on someone with an equal or higher role.";
  return null;
}

export function fmtCoins(n: number): string {
  return `${Math.floor(n).toLocaleString("en-US")} :coin:`;
}

export function rollDice(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clampInt(v: string | undefined, min: number, max: number, dflt: number): number {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

export function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
/**
 * The bot's commands only run in server text channels. `msg.channel` is a wide
 * union in discord.js (DMs, threads, voice chat...), so this helper narrows it
 * to TextChannel for send/awaitMessages/bulkDelete/permissionOverwrites.
 */
export function ch(msg: Message): TextChannel {
  return msg.channel as TextChannel;
}